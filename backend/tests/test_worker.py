import os
import sys
from concurrent.futures import ThreadPoolExecutor
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
    def execute(run_id, *, should_stop=None, worker_id=None):
        executed.append(run_id)
        assert callable(should_stop)
        assert worker_id == "worker-shutdown-test"
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
    clear_worker_heartbeats()
    main.ensure_schema()
    now = main.utcnow()
    queued_id = "RUN-QUEUE-OBS-" + main.uuid4().hex[:8].upper()
    running_id = "RUN-RUNNING-OBS-" + main.uuid4().hex[:8].upper()
    heartbeat_id = "worker-queue-observability-" + main.uuid4().hex[:8]
    with main.SessionLocal() as db:
        db.add_all([
            main.WorkflowRun(
                id=queued_id, goal="A private queued goal", status="queued",
                progress=0, stages=[], events=[], execution_mode="live-model",
                created_at=now - timedelta(seconds=12),
            ),
            main.WorkflowRun(
                id=running_id, goal="A private running goal", status="running",
                progress=10, stages=[], events=[], execution_mode="live-model",
                created_at=now,
            ),
            main.WorkerHeartbeat(id=heartbeat_id, last_seen_at=now, active_run_id=running_id),
        ])
        db.commit()

    snapshot = main.workflow_queue_snapshot()

    assert snapshot["queued_workflows"] >= 1
    assert snapshot["running_workflows"] >= 1
    assert snapshot["available_workers"] == 1
    assert snapshot["active_workers"] == 1
    assert snapshot["oldest_queued_seconds"] >= 10
    assert "private" not in str(snapshot)
    assert heartbeat_id not in str(snapshot)
    with main.SessionLocal() as db:
        db.delete(db.get(main.WorkflowRun, queued_id))
        db.delete(db.get(main.WorkflowRun, running_id))
        db.delete(db.get(main.WorkerHeartbeat, heartbeat_id))
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

    def execute(run_id, *, should_stop=None, worker_id=None):
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


def test_durable_workflow_claim_requires_live_worker_lease_and_releases_owner(monkeypatch):
    main.ensure_schema()
    run_id = "RUN-LEASE-CLAIM-" + main.uuid4().hex[:8].upper()
    worker_id = "worker-claim-owner-" + main.uuid4().hex[:8]
    with main.SessionLocal() as db:
        db.add(_queued_run(run_id, main.utcnow()))
        db.commit()

    # A durable worker may not claim a run unless its fresh heartbeat already
    # advertises that exact active run.
    assert main.execute_workflow(run_id, worker_id=worker_id) is False
    with main.SessionLocal() as db:
        assert db.get(main.WorkflowRun, run_id).status == "queued"

    main.touch_worker_heartbeat(worker_id, run_id)
    observed_owners = []

    def fake_complete(_agent, _role, _instruction, _goal, _context):
        with main.SessionLocal() as db:
            observed_owners.append(db.get(main.WorkflowRun, run_id).execution_worker_id)
        return ("lease-owned artifact", {"input_tokens": 1, "output_tokens": 1}, "resp-lease")

    monkeypatch.setattr(main, "complete_agent", fake_complete)
    try:
        assert main.execute_workflow(run_id, worker_id=worker_id) is True
        assert observed_owners and set(observed_owners) == {worker_id}
        with main.SessionLocal() as db:
            saved = db.get(main.WorkflowRun, run_id)
            assert saved.status == "review"
            assert saved.execution_worker_id is None
            assert saved.execution_token is None
    finally:
        main.remove_worker_heartbeat(worker_id)


def test_recovery_uses_worker_heartbeat_lease_not_only_run_age(monkeypatch):
    monkeypatch.setenv("CYRUS_WORKER_HEARTBEAT_TTL_SECONDS", "30")
    monkeypatch.setenv("CYRUS_WORKER_STALE_SECONDS", "600")
    main.ensure_schema()
    now = main.utcnow()
    expired_id = "RUN-LEASE-EXPIRED-" + main.uuid4().hex[:8].upper()
    live_id = "RUN-LEASE-LIVE-" + main.uuid4().hex[:8].upper()
    mismatch_id = "RUN-LEASE-MISMATCH-" + main.uuid4().hex[:8].upper()
    expired_worker = "worker-expired-" + main.uuid4().hex[:8]
    live_worker = "worker-live-" + main.uuid4().hex[:8]
    mismatch_worker = "worker-mismatch-" + main.uuid4().hex[:8]
    with main.SessionLocal() as db:
        db.add_all([
            main.WorkflowRun(
                id=expired_id, goal="Recover a worker with an expired lease",
                status="running", progress=14, stages=[], events=[],
                execution_mode="live-model", updated_at=now,
                execution_token="expired-token", execution_worker_id=expired_worker,
            ),
            main.WorkflowRun(
                id=live_id, goal="Keep a worker with a fresh lease",
                status="running", progress=14, stages=[], events=[],
                execution_mode="live-model",
                updated_at=now - timedelta(seconds=601),
                execution_token="live-token", execution_worker_id=live_worker,
            ),
            main.WorkflowRun(
                id=mismatch_id, goal="Recover a heartbeat assigned to another run",
                status="running", progress=14, stages=[], events=[],
                execution_mode="live-model", updated_at=now,
                execution_token="mismatch-token", execution_worker_id=mismatch_worker,
            ),
            main.WorkerHeartbeat(
                id=expired_worker, last_seen_at=now - timedelta(seconds=31),
                active_run_id=expired_id,
            ),
            main.WorkerHeartbeat(
                id=live_worker, last_seen_at=now, active_run_id=live_id,
            ),
            main.WorkerHeartbeat(
                id=mismatch_worker, last_seen_at=now, active_run_id="RUN-OTHER-OWNER",
            ),
        ])
        db.commit()

    assert main.recover_stale_runs(now=now) >= 2
    with main.SessionLocal() as db:
        expired = db.get(main.WorkflowRun, expired_id)
        live = db.get(main.WorkflowRun, live_id)
        mismatch = db.get(main.WorkflowRun, mismatch_id)
        assert expired.status == "failed"
        assert expired.execution_token is None
        assert expired.execution_worker_id is None
        assert live.status == "running"
        assert live.execution_worker_id == live_worker
        assert mismatch.status == "failed"
        assert mismatch.execution_worker_id is None
        for worker_id in (expired_worker, live_worker, mismatch_worker):
            heartbeat = db.get(main.WorkerHeartbeat, worker_id)
            if heartbeat is not None:
                db.delete(heartbeat)
        db.commit()


def test_concurrent_durable_workers_cannot_claim_the_same_run_twice(monkeypatch):
    main.ensure_schema()
    run_id = "RUN-CONCURRENT-CLAIM-" + main.uuid4().hex[:8].upper()
    workers = [
        "worker-race-a-" + main.uuid4().hex[:8],
        "worker-race-b-" + main.uuid4().hex[:8],
    ]
    with main.SessionLocal() as db:
        db.add(_queued_run(run_id, main.utcnow()))
        db.commit()
    for worker_id in workers:
        main.touch_worker_heartbeat(worker_id, run_id)

    calls = []
    calls_lock = threading.Lock()

    def fake_complete(agent, _role, _instruction, _goal, _context):
        with calls_lock:
            calls.append(agent)
        return ("concurrent claim artifact", {"input_tokens": 1, "output_tokens": 1}, "resp-race")

    monkeypatch.setattr(main, "complete_agent", fake_complete)
    start = threading.Barrier(2)

    def compete(worker_id):
        start.wait(timeout=5)
        return main.execute_workflow(run_id, worker_id=worker_id)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(compete, workers))
        assert sorted(results) == [False, True]
        assert len(calls) == 7
        with main.SessionLocal() as db:
            saved = db.get(main.WorkflowRun, run_id)
            assert saved.status == "review"
            assert len(saved.stages) == 7
            assert saved.execution_worker_id is None
            assert saved.execution_token is None
    finally:
        for worker_id in workers:
            main.remove_worker_heartbeat(worker_id)


def test_worker_keeps_active_lease_renewing_while_shutdown_drains_provider_call(monkeypatch):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    worker_id = "worker-drain-test"
    run_id = "RUN-WORKER-DRAIN"
    stop = threading.Event()
    entered = threading.Event()
    release = threading.Event()
    renewed_after_stop = threading.Event()
    removed = []
    heartbeat_values = []

    def touch(_identity, active_run_id=None):
        heartbeat_values.append(active_run_id)
        if stop.is_set() and active_run_id == run_id:
            renewed_after_stop.set()

    def bounded_setting(name, _default, _minimum, _maximum):
        return 0.01 if name == "CYRUS_WORKER_HEARTBEAT_SECONDS" else 0.5

    monkeypatch.setattr(main, "ensure_schema", lambda: None)
    monkeypatch.setattr(main, "touch_worker_heartbeat", touch)
    monkeypatch.setattr(main, "remove_worker_heartbeat", removed.append)
    monkeypatch.setattr(main, "recover_stale_runs", lambda: 0)
    monkeypatch.setattr(main, "prune_stale_worker_heartbeats", lambda: 0)
    monkeypatch.setattr(main, "bounded_float_setting", bounded_setting)
    monkeypatch.setattr(worker, "next_queued_run_id", lambda: run_id)

    def execute(_run_id, *, should_stop=None, worker_id=None):
        assert worker_id == worker_id_expected
        assert callable(should_stop)
        entered.set()
        release.wait(timeout=3)
        return True

    worker_id_expected = worker_id
    monkeypatch.setattr(main, "execute_workflow", execute)
    thread = threading.Thread(
        target=worker.run_worker,
        kwargs={"stop_event": stop, "worker_id": worker_id},
    )
    thread.start()
    try:
        assert entered.wait(timeout=2)
        stop.set()
        assert renewed_after_stop.wait(timeout=2)
    finally:
        release.set()
        thread.join(timeout=3)

    assert not thread.is_alive()
    assert worker_id in removed
    assert run_id in heartbeat_values
