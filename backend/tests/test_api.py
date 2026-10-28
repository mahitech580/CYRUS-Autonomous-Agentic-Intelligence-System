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


def test_health_contract(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "cyrus-api"
    assert "provider_configured" in body
    assert "persistent_storage" in body


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
