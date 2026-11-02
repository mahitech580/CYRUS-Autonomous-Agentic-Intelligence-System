import os
import sys
from datetime import timedelta
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-cyrus.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
import main


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
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CYRUS_EXTERNAL_WORKER", raising=False)
    main.ensure_schema()
    main.remove_worker_heartbeat("worker-readiness-test")

    assert main.external_worker_required() is True
    assert main.worker_is_ready() is False

    main.touch_worker_heartbeat("worker-readiness-test")
    assert main.worker_is_ready() is True


def test_worker_heartbeat_expires_after_the_configured_ttl(monkeypatch):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.setenv("CYRUS_WORKER_HEARTBEAT_TTL_SECONDS", "30")
    main.ensure_schema()
    main.touch_worker_heartbeat("worker-expiry-test")

    with main.SessionLocal() as db:
        heartbeat = db.get(main.WorkerHeartbeat, "worker-expiry-test")
        heartbeat.last_seen_at = main.utcnow() - timedelta(seconds=31)
        db.commit()

    assert main.worker_is_ready() is False


def test_config_disables_launch_when_external_worker_is_missing(client, monkeypatch):
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
