import os
import sys
from datetime import timedelta
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-cyrus.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
import main


def clear_worker_heartbeats():
    main.ensure_schema()
    with main.SessionLocal() as db:
        db.execute(main.delete(main.WorkerHeartbeat))
        db.commit()


@pytest.fixture
def client():
    main.ensure_schema()
    with TestClient(main.app) as test_client:
        yield test_client


def test_inline_development_mode_does_not_require_a_worker(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("CYRUS_EXTERNAL_WORKER", raising=False)
    assert main.external_worker_required() is False
    assert main.worker_is_ready() is True


def test_vercel_requires_a_fresh_external_worker_heartbeat(monkeypatch):
    clear_worker_heartbeats()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CYRUS_EXTERNAL_WORKER", raising=False)
    main.ensure_schema()
    main.remove_worker_heartbeat("worker-readiness-test")

    assert main.external_worker_required() is True
    assert main.worker_is_ready() is False

    main.touch_worker_heartbeat("worker-readiness-test")
    assert main.worker_is_ready() is True
    main.remove_worker_heartbeat("worker-readiness-test")


def test_worker_heartbeat_expires_after_the_configured_ttl(monkeypatch):
    clear_worker_heartbeats()
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.setenv("CYRUS_WORKER_HEARTBEAT_TTL_SECONDS", "30")
    main.ensure_schema()
    main.touch_worker_heartbeat("worker-expiry-test")

    with main.SessionLocal() as db:
        heartbeat = db.get(main.WorkerHeartbeat, "worker-expiry-test")
        heartbeat.last_seen_at = main.utcnow() - timedelta(seconds=31)
        db.commit()

    assert main.worker_is_ready() is False
    main.remove_worker_heartbeat("worker-expiry-test")


def test_config_disables_launch_when_external_worker_is_missing(client, monkeypatch):
    clear_worker_heartbeats()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("CYRUS_ACCESS_KEY", "test-access-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-provider-key")
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    main.remove_worker_heartbeat("worker-config-test")

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["worker_required"] is True
    assert response.json()["worker_ready"] is False
    assert response.json()["can_start_runs"] is False

def test_recover_stale_worker_run_fails_it_and_preserves_partial_artifacts(monkeypatch):
    monkeypatch.setenv("CYRUS_WORKER_STALE_SECONDS", "300")
    run_id = "RUN-STALE-" + main.uuid4().hex[:8].upper()
    now = main.utcnow()
    original_stages = [{"id": "plan", "output": "saved planning artifact"}]
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=run_id,
            goal="Recover an interrupted durable worker run safely",
            status="running",
            progress=14,
            stages=original_stages,
            events=[],
            execution_mode="live-model",
            current_stage="research",
            execution_token="stale-worker-token",
            updated_at=now - timedelta(seconds=301),
        ))
        db.commit()

    assert main.recover_stale_runs(now=now) == 1

    with main.SessionLocal() as db:
        recovered = db.get(main.WorkflowRun, run_id)
        assert recovered.status == "failed"
        assert recovered.current_stage is None
        assert recovered.execution_token is None
        assert recovered.stages == original_stages
        assert "Worker lease expired" in recovered.error
        assert recovered.events[-1]["status"] == "failed"


def test_recovery_ignores_fresh_and_non_running_workflows(monkeypatch):
    monkeypatch.setenv("CYRUS_WORKER_STALE_SECONDS", "300")
    now = main.utcnow()
    fresh_id = "RUN-FRESH-" + main.uuid4().hex[:8].upper()
    cancelled_id = "RUN-CANCELLED-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add_all([
            main.WorkflowRun(
                id=fresh_id, goal="Keep a fresh worker lease", status="running",
                progress=10, stages=[], events=[], execution_mode="live-model",
                updated_at=now, execution_token="fresh-token",
            ),
            main.WorkflowRun(
                id=cancelled_id, goal="Do not recover a cancelled workflow", status="cancelled",
                progress=10, stages=[], events=[], execution_mode="live-model",
                updated_at=now - timedelta(seconds=900), execution_token=None,
            ),
        ])
        db.commit()

    assert main.recover_stale_runs(now=now) == 0
    with main.SessionLocal() as db:
        assert db.get(main.WorkflowRun, fresh_id).status == "running"
        assert db.get(main.WorkflowRun, cancelled_id).status == "cancelled"

import threading

try:
    from backend import worker
except ImportError:
    import worker


def _queued_run(run_id, created_at):
    return main.WorkflowRun(
        id=run_id,
        goal="Process this queued workflow with a durable worker",
        status="queued",
        progress=0,
        stages=[],
        events=[],
        execution_mode="live-model",
        created_at=created_at,
    )


def test_worker_selects_the_oldest_queued_run_and_processes_one(monkeypatch):
    main.ensure_schema()
    now = main.utcnow()
    older_id = "RUN-WORKER-OLD-" + main.uuid4().hex[:8].upper()
    newer_id = "RUN-WORKER-NEW-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add_all([
            _queued_run(newer_id, now),
            _queued_run(older_id, now - timedelta(seconds=10)),
        ])
        db.commit()

    executed = []
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    def execute(run_id):
        executed.append(run_id)
        return True

    monkeypatch.setattr(main, "execute_workflow", execute)

    assert worker.next_queued_run_id() == older_id
    assert worker.run_once() == older_id
    assert executed == [older_id]


def test_run_once_does_not_report_a_run_when_another_worker_claimed_it(monkeypatch):
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    monkeypatch.setattr(worker, "next_queued_run_id", lambda: "RUN-CLAIMED-ELSEWHERE")
    monkeypatch.setattr(main, "execute_workflow", lambda _run_id: False)

    assert worker.run_once() is None


def test_shutdown_marks_the_active_run_failed_and_preserves_completed_stages(monkeypatch):
    main.ensure_schema()
    run_id = "RUN-SHUTDOWN-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(_queued_run(run_id, main.utcnow()))
        db.commit()

    completed = []

    def fake_complete(agent, role, instruction, goal, context):
        completed.append(agent)
        return ("saved artifact", {"input_tokens": 1, "output_tokens": 1}, "resp-shutdown")

    monkeypatch.setattr(main, "complete_agent", fake_complete)

    claimed = main.execute_workflow(
        run_id,
        should_stop=lambda: len(completed) >= 1,
    )

    assert claimed is True
    assert len(completed) == 1
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "failed"
        assert saved.progress == 14
        assert len(saved.stages) == 1
        assert saved.stages[0]["output"] == "saved artifact"
        assert saved.execution_token is None
        assert "shutdown requested" in saved.error.lower()
        assert saved.events[-1]["status"] == "failed"


def test_worker_loop_refreshes_and_removes_heartbeat_on_shutdown(monkeypatch, caplog):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    main.ensure_schema()
    stop = threading.Event()
    executed = []
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    monkeypatch.setattr(worker, "next_queued_run_id", lambda: "RUN-WORKER-STOP")
    def execute(run_id, *, should_stop=None):
        executed.append(run_id)
        assert callable(should_stop)
        stop.set()
    monkeypatch.setattr(main, "execute_workflow", execute)

    with caplog.at_level("INFO", logger="cyrus.worker"):
        worker.run_worker(stop_event=stop, worker_id="worker-shutdown-test")

    assert "worker started worker_id=worker-shutdown-test" in caplog.text
    assert "workflow dispatch worker_id=worker-shutdown-test run_id=RUN-WORKER-STOP" in caplog.text
    assert "worker stopped worker_id=worker-shutdown-test" in caplog.text
    assert executed == ["RUN-WORKER-STOP"]
    with main.SessionLocal() as db:
        assert db.get(main.WorkerHeartbeat, "worker-shutdown-test") is None


def test_worker_identity_is_safe_and_unique_per_process(monkeypatch):
    monkeypatch.setenv("CYRUS_WORKER_ID", "compose worker")
    monkeypatch.setattr(worker.socket, "gethostname", lambda: "host/name")
    monkeypatch.setattr(worker.os, "getpid", lambda: 1234)
    first = worker.worker_identity()
    monkeypatch.setattr(worker.os, "getpid", lambda: 1235)
    second = worker.worker_identity()

    assert first == "compose-worker-host-name-1234"
    assert second == "compose-worker-host-name-1235"
    assert first != second
    assert len(first) <= 64


def test_worker_refuses_to_start_without_external_worker_mode(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("CYRUS_EXTERNAL_WORKER", raising=False)
    with pytest.raises(RuntimeError, match="CYRUS_EXTERNAL_WORKER"):
        worker.run_worker(stop_event=threading.Event(), worker_id="worker-disabled-test")

def test_queue_and_recovery_queries_have_composite_indexes():
    main.ensure_schema()
    indexes = {index["name"] for index in main.inspect(main.engine).get_indexes("workflow_runs")}
    assert "ix_workflow_runs_queue_order" in indexes
    assert "ix_workflow_runs_stale_recovery" in indexes


def test_queue_snapshot_reports_aggregate_pressure_without_run_details():
    main.ensure_schema()
    now = main.utcnow()
    queued_id = "RUN-QUEUE-OBS-" + main.uuid4().hex[:8].upper()
    running_id = "RUN-RUNNING-OBS-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add_all([
            main.WorkflowRun(
                id=queued_id, goal="A private queued goal", status="queued",
                progress=0, stages=[], events=[], execution_mode="live-model",
                created_at=now,
            ),
            main.WorkflowRun(
                id=running_id, goal="A private running goal", status="running",
                progress=10, stages=[], events=[], execution_mode="live-model",
                created_at=now,
            ),
        ])
        db.commit()

    snapshot = main.workflow_queue_snapshot()

    assert snapshot["queued_workflows"] >= 1
    assert snapshot["running_workflows"] >= 1
    assert "oldest_queued_at" in snapshot
    assert "private" not in str(snapshot)
    with main.SessionLocal() as db:
        db.delete(db.get(main.WorkflowRun, queued_id))
        db.delete(db.get(main.WorkflowRun, running_id))
        db.commit()



def test_worker_retry_delay_is_exponential_and_bounded():
    assert worker.worker_retry_delay(1, 2.0) == 2.0
    assert worker.worker_retry_delay(2, 2.0) == 4.0
    assert worker.worker_retry_delay(3, 2.0) == 8.0
    assert worker.worker_retry_delay(99, 30.0) == 30.0
    assert worker.worker_retry_delay(0, 0.1) == 0.5


def test_worker_initialization_retries_transient_schema_failure(monkeypatch):
    attempts = {"schema": 0, "heartbeat": 0}

    class Stop:
        def is_set(self):
            return False

        def wait(self, _delay):
            return False

    def ensure_schema():
        attempts["schema"] += 1
        if attempts["schema"] == 1:
            raise RuntimeError("temporary database outage")

    def touch_heartbeat(_identity):
        attempts["heartbeat"] += 1

    monkeypatch.setattr(main, "ensure_schema", ensure_schema)
    monkeypatch.setattr(main, "touch_worker_heartbeat", touch_heartbeat)
    monkeypatch.setattr(worker, "worker_retry_delay", lambda *_args: 0.0)

    assert worker.initialize_worker(Stop(), "worker-startup-test", 1.0) is True
    assert attempts == {"schema": 2, "heartbeat": 1}


def test_worker_loop_recovers_after_transient_queue_query_failure(monkeypatch, caplog):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.setattr(main, "ensure_schema", lambda: None)
    monkeypatch.setattr(main, "touch_worker_heartbeat", lambda *_args: None)
    monkeypatch.setattr(main, "remove_worker_heartbeat", lambda *_args: None)
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    monkeypatch.setattr(worker, "worker_retry_delay", lambda *_args: 0.0)
    stop = threading.Event()
    attempts = {"queue": 0}
    executed = []

    def next_run():
        attempts["queue"] += 1
        if attempts["queue"] == 1:
            raise RuntimeError("temporary query failure")
        return "RUN-WORKER-RECOVERY"

    def execute(run_id, *, should_stop=None):
        executed.append(run_id)
        stop.set()
        return True

    monkeypatch.setattr(worker, "next_queued_run_id", next_run)
    monkeypatch.setattr(main, "execute_workflow", execute)

    with caplog.at_level("WARNING", logger="cyrus.worker"):
        worker.run_worker(stop_event=stop, worker_id="worker-recovery-test")

    assert attempts["queue"] >= 2
    assert executed == ["RUN-WORKER-RECOVERY"]
    assert "worker loop retry exception_type=RuntimeError" in caplog.text



def test_prune_stale_worker_heartbeats_removes_only_expired_rows(monkeypatch):
    monkeypatch.setenv("CYRUS_WORKER_HEARTBEAT_TTL_SECONDS", "30")
    main.ensure_schema()
    now = main.utcnow()
    stale_id = "worker-stale-cleanup-" + main.uuid4().hex[:8]
    fresh_id = "worker-fresh-cleanup-" + main.uuid4().hex[:8]
    with main.SessionLocal() as db:
        db.add_all([
            main.WorkerHeartbeat(
                id=stale_id,
                last_seen_at=now - timedelta(seconds=31),
                active_run_id=None,
            ),
            main.WorkerHeartbeat(
                id=fresh_id,
                last_seen_at=now,
                active_run_id=None,
            ),
        ])
        db.commit()

    assert main.prune_stale_worker_heartbeats(now=now) == 1

    with main.SessionLocal() as db:
        assert db.get(main.WorkerHeartbeat, stale_id) is None
        assert db.get(main.WorkerHeartbeat, fresh_id) is not None
        db.delete(db.get(main.WorkerHeartbeat, fresh_id))
        db.commit()
