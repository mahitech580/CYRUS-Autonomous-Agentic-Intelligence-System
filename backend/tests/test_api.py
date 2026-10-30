import os
import sys
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


def fake_agent(agent, role, instruction, goal, context):
    return (f"# {agent} output\n\nGenerated test artifact for: {goal}", {"input_tokens": 20, "output_tokens": 30}, "resp-test")




def test_provider_rejects_non_object_payload_and_tolerates_invalid_usage(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(main.httpx, "post", lambda *args, **kwargs: main.httpx.Response(200, json=[]))
    with pytest.raises(RuntimeError, match="unexpected response shape"):
        main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])

    monkeypatch.setattr(
        main.httpx,
        "post",
        lambda *args, **kwargs: main.httpx.Response(
            200,
            json={"output_text": "safe output", "usage": {"input_tokens": "unknown", "output_tokens": -4}, "id": 123},
        ),
    )
    output, usage, response_id = main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])
    assert output == "safe output"
    assert usage == {"input_tokens": 0, "output_tokens": 0}
    assert response_id is None


def test_runtime_numeric_settings_are_bounded_and_invalid_values_fall_back(monkeypatch):
    monkeypatch.setenv("CYRUS_PROVIDER_RETRIES", "99")
    monkeypatch.setenv("CYRUS_MAX_OUTPUT_TOKENS", "invalid")
    monkeypatch.setenv("CYRUS_LLM_TIMEOUT_SECONDS", "999")
    assert main.provider_retry_count() == 3
    assert main.bounded_int_setting("CYRUS_MAX_OUTPUT_TOKENS", 1200, 256, 3000) == 1200
    assert main.bounded_float_setting("CYRUS_LLM_TIMEOUT_SECONDS", 35.0, 1.0, 120.0) == 120.0


def test_provider_retries_rate_limit_then_returns_model_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_PROVIDER_RETRIES", "1")
    responses = [
        main.httpx.Response(429, headers={"Retry-After": "0"}),
        main.httpx.Response(200, json={"output_text": "ready", "usage": {"input_tokens": 2, "output_tokens": 3}, "id": "resp-ok"}),
    ]
    sleeps = []
    monkeypatch.setattr(main.httpx, "post", lambda *args, **kwargs: responses.pop(0))
    monkeypatch.setattr(main.time, "sleep", sleeps.append)
    output, usage, response_id = main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])
    assert output == "ready"
    assert usage == {"input_tokens": 2, "output_tokens": 3}
    assert response_id == "resp-ok"
    assert sleeps == [0.0]


def test_provider_retries_connection_establishment_failure(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_PROVIDER_RETRIES", "1")
    calls = {"count": 0}
    sleeps = []
    def fake_post(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise main.httpx.ConnectTimeout("connect timeout")
        return main.httpx.Response(200, json={"output_text": "connected"})
    monkeypatch.setattr(main.httpx, "post", fake_post)
    monkeypatch.setattr(main.time, "sleep", sleeps.append)
    output, _, _ = main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])
    assert output == "connected"
    assert calls["count"] == 2
    assert sleeps == [0.5]


def test_health_contract(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "cyrus-api"
    assert "provider_configured" in body
    assert "persistent_storage" in body



def test_health_distinguishes_database_liveness_from_run_readiness(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CYRUS_LLM_API_KEY", raising=False)
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "reachable"
    assert body["ready_for_runs"] is False


def test_readiness_requires_durable_storage_provider_and_production_access_key(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CYRUS_LLM_API_KEY", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert client.get("/api/ready").status_code == 503

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert client.get("/api/ready").status_code == 200
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("CYRUS_ACCESS_KEY", "private-test-key")
    response = client.get("/api/ready")
    assert response.status_code == 503
    assert "Persistent production storage" in response.json()["detail"]
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("CYRUS_ACCESS_KEY", raising=False)


def test_agent_registry_has_seven_roles(client):
    response = client.get("/api/agents")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 7
    assert body["items"][0]["id"] == "planner"


def test_config_does_not_expose_secrets(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    body = response.json()
    assert "OPENAI_API_KEY" not in str(body)
    assert "DATABASE_URL" not in str(body)
    assert "provider_configured" in body


def test_rejects_short_goal(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    response = client.post("/api/runs", json={"goal": "tiny"})
    assert response.status_code == 422


def test_requires_model_provider(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CYRUS_LLM_API_KEY", raising=False)
    response = client.post("/api/runs", json={"goal": "Build a secure profile API"})
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_real_run_generates_seven_stage_artifacts(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "complete_agent", fake_agent)
    response = client.post("/api/runs", json={"goal": "Build a secure profile API"})
    assert response.status_code == 202
    run_id = response.json()["item"]["id"]

    # FastAPI TestClient awaits the background task, so the mocked provider has
    # completed by the time the next request runs.
    detail_response = client.get(f"/api/runs/{run_id}")
    assert detail_response.status_code == 200
    item = detail_response.json()["item"]
    assert item["status"] == "review"
    assert item["progress"] == 100
    assert len(item["stages"]) == 7
    assert item["stages"][0]["output"].startswith("# Atlas output")
    assert item["execution_mode"] == "live-model"


def test_approval_is_logged_but_does_not_deploy(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "complete_agent", fake_agent)
    created = client.post("/api/runs", json={"goal": "Prepare a service deployment plan"})
    run_id = created.json()["item"]["id"]
    response = client.post(f"/api/runs/{run_id}/approval", json={"decision": "approve", "note": "Reviewed"})
    assert response.status_code == 200
    body = response.json()
    assert body["item"]["status"] == "approved"
    assert "does not trigger a deployment" in body["item"]["events"][-1]["message"]


def test_missing_run_is_404(client):
    response = client.get("/api/runs/RUN-NOT-REAL")
    assert response.status_code == 404


def test_access_key_protects_workspace_data(client, monkeypatch):
    monkeypatch.setenv("CYRUS_ACCESS_KEY", "private-test-key")
    assert client.get("/api/runs").status_code == 401
    assert client.get("/api/runs", headers={"Authorization": "Bearer private-test-key"}).status_code == 200
    monkeypatch.delenv("CYRUS_ACCESS_KEY", raising=False)





def _persist_event_run():
    run = main.WorkflowRun(
        id="RUN-EVENT-" + main.uuid4().hex[:8].upper(),
        goal="Exercise bounded event history",
        status="running",
        progress=20,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
    )
    for index in range(3):
        main.append_event(run, "plan", "Atlas", f"Event {index + 1}", "started")
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()
    return run.id


def test_event_endpoint_pages_with_a_stable_cursor(client):
    run_id = _persist_event_run()
    first = client.get(f"/api/runs/{run_id}/events?limit=2")
    assert first.status_code == 200
    body = first.json()
    assert len(body["items"]) == 2
    assert body["has_more"] is True
    assert body["cursor_expired"] is False
    second = client.get(f"/api/runs/{run_id}/events?after={body['next_after']}&limit=2")
    assert len(second.json()["items"]) == 1
    assert second.json()["has_more"] is False


def test_event_endpoint_marks_an_expired_cursor_for_client_recovery(client):
    run_id = _persist_event_run()
    response = client.get(f"/api/runs/{run_id}/events?after=expired-cursor")
    assert response.status_code == 200
    assert response.json()["cursor_expired"] is True
    assert len(response.json()["items"]) == 3


def test_lightweight_run_status_omits_artifact_payloads(client):
    run_id = _persist_event_run()
    response = client.get(f"/api/runs/{run_id}/status")
    assert response.status_code == 200
    item = response.json()["item"]
    assert item["id"] == run_id
    assert item["status"] == "running"
    assert "stages" not in item
    assert "events" not in item
    assert "goal" not in item


def test_run_goal_is_redacted_before_storage_and_execution(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    captured = {}
    def capture_agent(agent, role, instruction, goal, context):
        captured["goal"] = goal
        return fake_agent(agent, role, instruction, goal, context)
    monkeypatch.setattr(main, "complete_agent", capture_agent)
    secret_goal = "Build API with Authorization: Bearer hidden-token-value and OPENAI_API_KEY=sk-proj-12345678901234567890"
    response = client.post("/api/runs", json={"goal": secret_goal})
    assert response.status_code == 202
    stored = response.json()["item"]["goal"]
    assert "hidden-token-value" not in stored
    assert "sk-proj-12345678901234567890" not in stored
    assert captured["goal"] == stored
    assert "[REDACTED]" in stored


def test_access_key_requires_bearer_authorization_scheme(client, monkeypatch):
    monkeypatch.setenv("CYRUS_ACCESS_KEY", "private-test-key")
    assert client.get("/api/runs").status_code == 401
    assert client.get("/api/runs", headers={"Authorization": "private-test-key"}).status_code == 401
    assert client.get("/api/runs", headers={"Authorization": "Basic private-test-key"}).status_code == 401
    assert client.get("/api/runs", headers={"Authorization": "bearer private-test-key"}).status_code == 200
    monkeypatch.delenv("CYRUS_ACCESS_KEY", raising=False)

def test_production_ephemeral_sqlite_is_rejected(client, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_ACCESS_KEY", "private-test-key")
    response = client.post(
        "/api/runs",
        json={"goal": "Build a secure profile API"},
        headers={"Authorization": "Bearer private-test-key"},
    )
    assert response.status_code == 503
    assert "Persistent storage is not configured" in response.json()["detail"]



def test_cancellation_during_provider_call_discards_late_stage_output(client, monkeypatch):
    run_id = "RUN-CANCEL-RACE-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Cancel while the model is working",
        status="queued",
        progress=0,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    def cancel_during_request(agent, role, instruction, goal, context):
        with main.SessionLocal() as db:
            active = db.get(main.WorkflowRun, run_id)
            active.status = "cancelled"
            active.current_stage = None
            db.commit()
        return fake_agent(agent, role, instruction, goal, context)

    monkeypatch.setattr(main, "complete_agent", cancel_during_request)
    main.execute_workflow(run_id)
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "cancelled"
        assert saved.stages == []
        assert saved.progress == 0


def test_terminal_workflow_cannot_be_cancelled_again(client):
    run_id = "RUN-TERMINAL-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Already completed workflow",
        status="review",
        progress=100,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()
    response = client.post(f"/api/runs/{run_id}/cancel")
    assert response.status_code == 409


def test_cancel_queued_workflow_records_state_and_event(client, monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("CYRUS_ACCESS_KEY", raising=False)
    run_id = "RUN-CANCEL-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Prepare a cancellable queued workflow",
        status="queued",
        progress=0,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
    )
    main.append_event(run, "workflow", "CYRUS", "Run queued for test.", "queued")
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    response = client.post(f"/api/runs/{run_id}/cancel")
    assert response.status_code == 200
    item = response.json()["item"]
    assert item["status"] == "cancelled"
    assert item["current_stage"] is None
    assert item["events"][-1]["status"] == "cancelled"
