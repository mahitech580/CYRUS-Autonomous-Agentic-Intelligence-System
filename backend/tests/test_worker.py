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


def test_worker_loop_refreshes_and_removes_heartbeat_on_shutdown(monkeypatch):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    main.ensure_schema()
    stop = threading.Event()
    executed = []
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    monkeypatch.setattr(worker, "next_queued_run_id", lambda: "RUN-WORKER-STOP")
    def execute(run_id):
        executed.append(run_id)
        stop.set()
    monkeypatch.setattr(main, "execute_workflow", execute)

    worker.run_worker(stop_event=stop, worker_id="worker-shutdown-test")

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
