import asyncio
import logging
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




def test_provider_rejects_partial_or_unfinished_responses(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    for status, message in [
        ("incomplete", "response was incomplete"),
        ("in_progress", "did not complete"),
        ("failed", "did not complete"),
    ]:
        monkeypatch.setattr(
            main.httpx,
            "post",
            lambda *args, _status=status, **kwargs: main.httpx.Response(
                200, json={"status": _status, "output_text": "partial provider text"}
            ),
        )
        with pytest.raises(RuntimeError, match=message):
            main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])


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


def test_provider_model_uses_a_trimmed_override_and_safe_default(monkeypatch):
    monkeypatch.delenv("CYRUS_MODEL", raising=False)
    assert main.provider_model() == "gpt-6-luna"

    monkeypatch.setenv("CYRUS_MODEL", "   ")
    assert main.provider_model() == "gpt-6-luna"

    monkeypatch.setenv("CYRUS_MODEL", "  custom-model-v2  ")
    assert main.provider_model() == "custom-model-v2"


def test_web_search_toggle_normalizes_whitespace_and_case(monkeypatch):
    monkeypatch.setenv("CYRUS_ENABLE_WEB_SEARCH", " TRUE ")
    assert main.web_search_enabled() is True
    monkeypatch.setenv("CYRUS_ENABLE_WEB_SEARCH", " false ")
    assert main.web_search_enabled() is False


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
    assert "available_workers" in body
    assert "active_workers" in body
    assert "oldest_queued_seconds" in body


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



def test_approval_decision_is_single_use(client):
    run_id = "RUN-APPROVAL-CAS-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Protect the human approval state transition",
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

    approved = client.post(f"/api/runs/{run_id}/approval", json={"decision": "approve"})
    rejected = client.post(f"/api/runs/{run_id}/approval", json={"decision": "reject"})

    assert approved.status_code == 200
    assert rejected.status_code == 409
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "approved"
        assert saved.approval_status == "approved"
        assert len(saved.events) == 1


def test_cancellation_transition_is_single_use(client):
    run_id = "RUN-CANCEL-CAS-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Protect the workflow cancellation state transition",
        status="running",
        progress=20,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
        execution_token="worker-cas-token",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    first = client.post(f"/api/runs/{run_id}/cancel")
    second = client.post(f"/api/runs/{run_id}/cancel")

    assert first.status_code == 200
    assert second.status_code == 409
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "cancelled"
        assert saved.execution_token is None
        assert len(saved.events) == 1



def test_create_run_replays_idempotency_key_without_scheduling_twice(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("CYRUS_ACCESS_KEY", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    scheduled = []
    monkeypatch.setattr(main, "execute_workflow", lambda run_id: scheduled.append(run_id))
    headers = {"Idempotency-Key": "cyrus-run-request-2026-001"}
    payload = {"goal": "Build a secure account API with idempotent creation"}

    first = client.post("/api/runs", json=payload, headers=headers)
    assert first.status_code == 202
    run_id = first.json()["item"]["id"]

    # A replay remains safe even if provider configuration changes after the
    # original request was accepted.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    replay = client.post("/api/runs", json=payload, headers=headers)

    assert replay.status_code == 202
    assert replay.json()["item"]["id"] == run_id
    assert len(scheduled) == 1
    with main.SessionLocal() as db:
        matches = db.query(main.WorkflowRun).filter_by(idempotency_key=headers["Idempotency-Key"]).all()
        assert len(matches) == 1


def test_create_run_rejects_idempotency_key_reuse_for_another_goal(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    scheduled = []
    monkeypatch.setattr(main, "execute_workflow", lambda run_id: scheduled.append(run_id))
    headers = {"Idempotency-Key": "cyrus-run-request-2026-002"}

    first = client.post(
        "/api/runs",
        json={"goal": "Build a secure account API with one accepted request"},
        headers=headers,
    )
    conflict = client.post(
        "/api/runs",
        json={"goal": "Build a different billing API with the same request key"},
        headers=headers,
    )

    assert first.status_code == 202
    assert conflict.status_code == 409
    assert len(scheduled) == 1


def test_create_run_rejects_malformed_idempotency_keys_before_scheduling(client):
    response = client.post(
        "/api/runs",
        json={"goal": "Build a secure account API with idempotency"},
        headers={"Idempotency-Key": "bad"},
    )
    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["detail"]



def test_retry_failed_workflow_creates_a_new_attempt_and_preserves_original(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    source_id = "RUN-RETRY-SOURCE-" + main.uuid4().hex[:8].upper()
    source = main.WorkflowRun(
        id=source_id,
        goal="Recover a failed seven-stage workflow safely",
        status="failed",
        progress=42,
        stages=[{"id": "plan", "output": "preserved original planning artifact"}],
        events=[],
        execution_mode="live-model",
        current_stage=None,
        error="Temporary provider failure",
        approval_status="pending",
    )
    with main.SessionLocal() as db:
        db.add(source)
        db.commit()

    scheduled = []
    monkeypatch.setattr(main, "execute_workflow", lambda run_id: scheduled.append(run_id))
    response = client.post(f"/api/runs/{source_id}/retry")

    assert response.status_code == 202
    retried = response.json()["item"]
    assert retried["id"] != source_id
    assert retried["goal"] == source.goal
    assert retried["status"] == "queued"
    assert retried["stages"] == []
    assert source_id in retried["events"][-1]["message"]
    assert scheduled == [retried["id"]]

    with main.SessionLocal() as db:
        original = db.get(main.WorkflowRun, source_id)
        assert original.status == "failed"
        assert original.stages[0]["output"] == "preserved original planning artifact"


def test_retry_rejects_workflows_that_are_not_failed(client):
    run_id = "RUN-RETRY-REVIEW-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=run_id,
            goal="Do not retry a workflow awaiting human review",
            status="review",
            progress=100,
            stages=[],
            events=[],
            execution_mode="live-model",
            approval_status="pending",
        ))
        db.commit()

    response = client.post(f"/api/runs/{run_id}/retry")
    assert response.status_code == 409


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
    assert body["total"] == 3
    assert body["has_more"] is True
    assert body["cursor_expired"] is False
    second = client.get(f"/api/runs/{run_id}/events?after={body['next_after']}&limit=2")
    assert len(second.json()["items"]) == 1
    assert second.json()["total"] == 3
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
    assert item["stage_count"] == 0
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
        headers={"Authorization": "Bearer private-test-key", "Idempotency-Key": "production-sqlite-123"},
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


def test_run_list_total_counts_all_records_when_results_are_limited(client):
    with main.SessionLocal() as db:
        before = db.query(main.WorkflowRun).count()
        for index in range(3):
            db.add(main.WorkflowRun(
                id="RUN-LIST-COUNT-" + main.uuid4().hex[:8].upper(),
                goal=f"List count regression {index}",
                status="queued",
                progress=0,
                stages=[],
                events=[],
                execution_mode="live-model",
                approval_status="pending",
            ))
        db.commit()
        expected_total = before + 3

    response = client.get("/api/runs?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] == expected_total

 

def test_run_list_supports_stable_offset_pages(client):
    run_ids = [
        "RUN-PAGE-A-" + main.uuid4().hex[:8].upper(),
        "RUN-PAGE-B-" + main.uuid4().hex[:8].upper(),
        "RUN-PAGE-C-" + main.uuid4().hex[:8].upper(),
    ]
    shared_timestamp = main.utcnow() + main.timedelta(days=3650)
    with main.SessionLocal() as db:
        for run_id in run_ids:
            db.add(main.WorkflowRun(
                id=run_id,
                goal="Verify workflow history pagination",
                status="completed",
                progress=100,
                created_at=shared_timestamp,
                updated_at=shared_timestamp,
                stages=[],
                events=[],
                execution_mode="live-model",
                approval_status="approved",
            ))
        db.commit()

    first = client.get("/api/runs?limit=2&offset=0")
    second = client.get("/api/runs?limit=2&offset=2")
    assert first.status_code == second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    expected = sorted(run_ids, reverse=True)
    assert [item["id"] for item in first_body["items"]] == expected[:2]
    assert [item["id"] for item in second_body["items"][:1]] == expected[2:]
    assert not ({item["id"] for item in first_body["items"]} & {item["id"] for item in second_body["items"]})
    assert first_body["total"] == second_body["total"]
    assert first_body["has_more"] is True
    assert first_body["next_offset"] == 2
    assert second_body["offset"] == 2


def test_run_list_filters_status_and_counts_only_matching_records(client):
    review_ids = [
        "RUN-REVIEW-FILTER-" + main.uuid4().hex[:8].upper(),
        "RUN-REVIEW-FILTER-" + main.uuid4().hex[:8].upper(),
    ]
    failed_id = "RUN-FAILED-FILTER-" + main.uuid4().hex[:8].upper()
    rejected_id = "RUN-REJECTED-FILTER-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        existing_reviews = db.query(main.WorkflowRun).filter(main.WorkflowRun.status == "review").count()
        for run_id in review_ids:
            db.add(main.WorkflowRun(
                id=run_id,
                goal="Keep the review queue scoped to pending decisions",
                status="review",
                progress=100,
                stages=[],
                events=[],
                execution_mode="live-model",
                approval_status="pending",
            ))
        db.add(main.WorkflowRun(
            id=failed_id,
            goal="Keep failed workflows out of the review queue",
            status="failed",
            progress=40,
            stages=[],
            events=[],
            execution_mode="live-model",
            approval_status="pending",
        ))
        db.add(main.WorkflowRun(
            id=rejected_id,
            goal="Preserve rejected review decisions in workflow history",
            status="rejected",
            progress=100,
            stages=[],
            events=[],
            execution_mode="live-model",
            approval_status="rejected",
        ))
        db.commit()

    first = client.get("/api/runs?status=review&limit=1&offset=0")
    second = client.get("/api/runs?status=review&limit=1&offset=1")
    assert first.status_code == second.status_code == 200
    first_body = first.json()
    second_body = second.json()
    assert first_body["total"] == second_body["total"] == existing_reviews + 2
    assert len(first_body["items"]) == len(second_body["items"]) == 1
    assert all(item["status"] == "review" for item in first_body["items"] + second_body["items"])
    assert first_body["has_more"] is True
    assert first_body["next_offset"] == 1
    assert second_body["has_more"] is True or second_body["next_offset"] is None
    assert failed_id not in str(first_body) + str(second_body)

    rejected = client.get("/api/runs?status=rejected&limit=10")
    assert rejected.status_code == 200
    rejected_body = rejected.json()
    assert rejected_id in {item["id"] for item in rejected_body["items"]}
    assert all(item["status"] == "rejected" for item in rejected_body["items"])

    invalid = client.get("/api/runs?status=unknown")
    assert invalid.status_code == 422


def test_run_list_returns_workspace_metrics_even_when_history_is_filtered(client):
    before_all = client.get("/api/runs").json()["stats"]
    before_review = client.get("/api/runs?status=review").json()["total"]
    records = [
        ("queued", 0),
        ("review", 100),
        ("failed", 40),
    ]
    created_ids = []
    with main.SessionLocal() as db:
        for status, progress in records:
            run_id = "RUN-METRICS-" + main.uuid4().hex[:10].upper()
            created_ids.append(run_id)
            db.add(main.WorkflowRun(
                id=run_id,
                goal="Verify workspace-wide workflow metrics",
                status=status,
                progress=progress,
                stages=[],
                events=[],
                execution_mode="live-model",
                approval_status="pending",
            ))
        db.commit()
        progress_values = db.query(main.WorkflowRun.progress).all()
        expected_average = round(sum(value[0] for value in progress_values) / len(progress_values), 1)

    filtered = client.get("/api/runs?status=review&limit=100")
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == before_review + 1
    assert body["stats"]["total"] == before_all["total"] + 3
    assert body["stats"]["active"] == before_all["active"] + 1
    assert body["stats"]["completed"] == before_all["completed"] + 1
    assert body["stats"]["average_progress"] == expected_average
    assert all(item["status"] == "review" for item in body["items"])
    assert created_ids[0] not in {item["id"] for item in body["items"]}


def test_run_list_omits_artifact_payloads_and_reports_detail_counts(client):
    run = main.WorkflowRun(
        id="RUN-SUMMARY-" + main.uuid4().hex[:8].upper(),
        goal="Keep list responses lightweight",
        status="review",
        progress=100,
        stages=[{"id": "plan", "output": "large generated artifact"}],
        events=[{"id": "event-1", "message": "stage completed"}],
        execution_mode="live-model",
        approval_status="pending",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    response = client.get("/api/runs?limit=100")
    assert response.status_code == 200
    item = next(entry for entry in response.json()["items"] if entry["id"] == run.id)
    assert item["stage_count"] == 1
    assert item["event_count"] == 1
    assert "stages" not in item
    assert "events" not in item
    assert "large generated artifact" not in str(item)


def test_provider_key_selection_ignores_whitespace_and_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "   ")
    monkeypatch.setenv("CYRUS_LLM_API_KEY", " fallback-provider-key ")
    assert main.provider_ready() is True
    assert main.provider_api_key() == "fallback-provider-key"

    monkeypatch.setenv("OPENAI_API_KEY", " primary-provider-key ")
    assert main.provider_api_key() == "primary-provider-key"


def test_retry_after_supports_http_dates_and_bounds_waits():
    now = main.datetime(2026, 10, 30, 12, 0, tzinfo=main.timezone.utc)
    assert main.retry_after_seconds("2.5", now=now) == 2.5
    assert main.retry_after_seconds("Fri, 30 Oct 2026 12:00:03 GMT", now=now) == 3.0
    assert main.retry_after_seconds("Fri, 30 Oct 2026 12:00:20 GMT", now=now) == 5.0
    assert main.retry_after_seconds("Fri, 30 Oct 2026 11:59:59 GMT", now=now) == 0.0
    assert main.retry_after_seconds("not-a-date", now=now) is None
    assert main.retry_after_seconds("NaN", now=now) is None


def test_api_responses_include_security_headers_and_validated_request_ids(client):
    response = client.get("/api/health", headers={"X-Request-ID": "daily-run.42"})
    assert response.headers["X-Request-ID"] == "daily-run.42"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Cache-Control"] == "no-store"

    invalid = client.get("/api/health", headers={"X-Request-ID": "not a safe id"})
    generated_id = invalid.headers["X-Request-ID"]
    assert generated_id != "not a safe id"
    assert len(generated_id) == 32


def test_request_logs_include_correlation_and_latency_without_query_values(client, caplog):
    with caplog.at_level("INFO", logger="cyrus"):
        response = client.get(
            "/api/health?token=private-query-value",
            headers={"X-Request-ID": "daily-log-7"},
        )
    assert response.status_code == 200
    assert "request completed" in caplog.text
    assert "request_id=daily-log-7" in caplog.text
    assert "route=/api/health" in caplog.text
    assert "duration_ms=" in caplog.text
    assert "private-query-value" not in caplog.text


def test_app_lifespan_initializes_database_schema(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "ensure_schema", lambda: calls.append("initialized"))
    with TestClient(main.app):
        pass
    assert calls == ["initialized"]

def test_workflow_worker_claim_is_single_use(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    run_id = "RUN-WORKER-CLAIM-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Prevent duplicate background workers",
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

    calls = []
    def counted_agent(agent, role, instruction, goal, context):
        calls.append(agent)
        return fake_agent(agent, role, instruction, goal, context)

    monkeypatch.setattr(main, "complete_agent", counted_agent)
    assert main.execute_workflow(run_id) is True
    assert main.execute_workflow(run_id) is False

    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "review"
        assert saved.progress == 100
        assert len(saved.stages) == 7
        assert saved.execution_token is None
    assert len(calls) == 7


def test_cancel_clears_worker_ownership(client):
    run_id = "RUN-CANCEL-OWNER-" + main.uuid4().hex[:8].upper()
    run = main.WorkflowRun(
        id=run_id,
        goal="Cancel a running workflow worker",
        status="running",
        progress=20,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
        execution_token="active-worker-token",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    response = client.post(f"/api/runs/{run_id}/cancel")
    assert response.status_code == 200
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "cancelled"
        assert saved.execution_token is None

def test_runtime_readiness_requires_a_reachable_database(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_reachable", lambda: False)

    config = client.get("/api/config").json()
    assert config["database_reachable"] is False
    assert config["can_start_runs"] is False

    health = client.get("/api/health").json()
    assert health["status"] == "degraded"
    assert health["ready_for_runs"] is False
    assert client.get("/api/ready").status_code == 503

def test_provider_endpoint_requires_https_except_for_loopback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://api.openai.com/v1")
    assert main.provider_ready() is False
    with pytest.raises(RuntimeError, match="provider URL is invalid"):
        main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])

    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:9000/v1/")
    assert main.provider_ready() is True
    assert main.provider_endpoint() == "http://localhost:9000/v1/responses"

    monkeypatch.setenv("OPENAI_BASE_URL", "https://user:password@api.openai.com/v1")
    assert main.provider_ready() is False


def test_provider_identity_uses_exact_openai_hostname(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.notopenai.com/v1")
    assert main.provider_name() == "OpenAI-compatible Responses API"
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    assert main.provider_name() == "OpenAI Responses API"

def test_cors_exposes_request_id_for_browser_error_diagnostics(client):
    response = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("x-request-id")
    exposed = response.headers.get("access-control-expose-headers", "").lower()
    assert "x-request-id" in exposed

def test_cors_origin_configuration_is_normalized_and_deduplicated(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        " https://Workspace.Example.com/,https://workspace.example.com,"
        "http://localhost:80/,https://bad.example.com/path,not-an-origin,"
        "https://user:pass@example.com",
    )
    assert main.configured_cors_origins() == [
        "https://workspace.example.com",
        "http://localhost",
    ]

def test_database_timestamps_are_serialized_as_explicit_utc(client):
    run_id = "RUN-UTC-" + main.uuid4().hex[:8].upper()
    naive_utc = main.datetime(2026, 11, 1, 12, 30, 0)
    run = main.WorkflowRun(
        id=run_id,
        goal="Preserve UTC timestamps through SQLite",
        status="completed",
        progress=100,
        created_at=naive_utc,
        updated_at=naive_utc,
        stages=[],
        events=[],
        execution_mode="live-model",
        approval_status="pending",
    )
    with main.SessionLocal() as db:
        db.add(run)
        db.commit()

    detail = client.get(f"/api/runs/{run_id}").json()["item"]
    status = client.get(f"/api/runs/{run_id}/status").json()["item"]
    summary = next(
        item for item in client.get("/api/runs?limit=100").json()["items"]
        if item["id"] == run_id
    )
    assert detail["created_at"] == "2026-11-01T12:30:00+00:00"
    assert detail["updated_at"] == "2026-11-01T12:30:00+00:00"
    assert status["updated_at"] == "2026-11-01T12:30:00+00:00"
    assert summary["created_at"] == "2026-11-01T12:30:00+00:00"

def test_request_failure_logs_correlation_without_exception_text(caplog):
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/private",
        "raw_path": b"/api/private",
        "query_string": b"",
        "headers": [(b"x-request-id", b"safe-correlation-42")],
        "server": ("testserver", 80),
        "client": ("testclient", 1234),
        "root_path": "",
    }
    request = main.Request(scope)

    async def fail_with_secret(_request):
        raise RuntimeError("Bearer do-not-log-this-token")

    with caplog.at_level(logging.ERROR, logger="cyrus"):
        with pytest.raises(RuntimeError):
            asyncio.run(main.add_security_headers(request, fail_with_secret))

    assert "safe-correlation-42" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "do-not-log-this-token" not in caplog.text

def test_provider_rejects_unknown_and_non_string_statuses_with_partial_text(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    for status in ("partial", "", 123, {"state": "completed"}):
        monkeypatch.setattr(
            main.httpx,
            "post",
            lambda *args, _status=status, **kwargs: main.httpx.Response(
                200,
                json={"status": _status, "output_text": "apparently usable partial text"},
            ),
        )
        with pytest.raises(RuntimeError, match="response status|did not complete"):
            main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])

def test_provider_marks_output_that_exceeds_artifact_limit(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    oversized = "A" * 30050
    monkeypatch.setattr(
        main.httpx,
        "post",
        lambda *args, **kwargs: main.httpx.Response(200, json={"output_text": oversized}),
    )
    output, _, _ = main.complete_agent("Atlas", "Planning agent", "Plan", "Build an API", [])
    assert len(output) <= 30000
    assert output.startswith("A" * 100)
    assert output.endswith("[Output truncated by CYRUS at 30,000 characters.]")
    assert "\n\n[Output truncated" in output


def test_create_run_uses_the_durable_queue_when_external_worker_is_required(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    main.touch_worker_heartbeat("worker-create-queue-test")
    scheduled = []
    monkeypatch.setattr(main, "execute_workflow", scheduled.append)

    response = client.post("/api/runs", json={"goal": "Queue this workflow for the durable worker"}, headers={"Idempotency-Key": "worker-create-queue-123"})

    assert response.status_code == 202
    assert response.json()["item"]["status"] == "queued"
    assert "durable worker" in response.json()["notice"]
    assert scheduled == []
    main.remove_worker_heartbeat("worker-create-queue-test")


def test_create_run_rejects_external_worker_mode_without_a_fresh_heartbeat(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    main.remove_worker_heartbeat("worker-create-missing-test")

    response = client.post("/api/runs", json={"goal": "Require a live durable execution worker"}, headers={"Idempotency-Key": "worker-create-missing-123"})

    assert response.status_code == 503
    assert "execution worker" in response.json()["detail"].lower()

def test_retry_replays_idempotency_key_without_creating_duplicate_workflows(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    monkeypatch.setattr(main, "worker_is_ready", lambda: True)
    source_id = "RUN-RETRY-IDEMP-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=source_id,
            goal="Retry an interrupted workflow exactly once",
            status="failed",
            progress=40,
            stages=[{"id": "plan", "output": "preserved original artifact"}],
            events=[],
            execution_mode="live-model",
            approval_status="pending",
        ))
        db.commit()

    headers = {"Idempotency-Key": "retry-request-123"}
    first = client.post(f"/api/runs/{source_id}/retry", headers=headers)
    replay = client.post(f"/api/runs/{source_id}/retry", headers=headers)

    assert first.status_code == 202
    assert replay.status_code == 202
    assert replay.json()["item"]["id"] == first.json()["item"]["id"]
    assert "already accepted" in replay.json()["notice"]
    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, first.json()["item"]["id"])
        assert saved.idempotency_key.startswith("retry:")
        assert saved.idempotency_key != headers["Idempotency-Key"]
        assert db.get(main.WorkflowRun, source_id).stages[0]["output"] == "preserved original artifact"


def test_retry_rejects_malformed_idempotency_keys(client, monkeypatch):
    source_id = "RUN-RETRY-BADKEY-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=source_id, goal="Reject malformed retry idempotency keys",
            status="failed", progress=10, stages=[], events=[],
            execution_mode="live-model", approval_status="pending",
        ))
        db.commit()

    response = client.post(
        f"/api/runs/{source_id}/retry",
        headers={"Idempotency-Key": "bad key"},
    )
    assert response.status_code == 400


def test_retry_uses_the_durable_queue_when_external_worker_is_required(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    main.touch_worker_heartbeat("worker-retry-queue-test")
    source_id = "RUN-RETRY-QUEUE-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=source_id,
            goal="Retry a failed workflow through the external worker",
            status="failed",
            progress=25,
            stages=[{"id": "plan", "output": "original artifact"}],
            events=[],
            execution_mode="live-model",
            approval_status="pending",
        ))
        db.commit()
    scheduled = []
    monkeypatch.setattr(main, "execute_workflow", scheduled.append)

    response = client.post(f"/api/runs/{source_id}/retry", headers={"Idempotency-Key": "worker-retry-queue-123"})

    assert response.status_code == 202
    assert response.json()["item"]["status"] == "queued"
    assert "durable worker" in response.json()["notice"]
    assert scheduled == []
    main.remove_worker_heartbeat("worker-retry-queue-test")


def test_workflow_failure_event_identifies_the_stage_and_agent(client, monkeypatch):
    run_id = "RUN-FAIL-STAGE-" + main.uuid4().hex[:8].upper()
    with main.SessionLocal() as db:
        db.add(main.WorkflowRun(
            id=run_id,
            goal="Identify the exact stage that failed",
            status="queued",
            progress=0,
            stages=[],
            events=[],
            execution_mode="live-model",
            approval_status="pending",
        ))
        db.commit()

    def fail_during_research(agent, role, instruction, goal, context):
        if agent == "Scout":
            raise RuntimeError("Research provider temporarily unavailable")
        return fake_agent(agent, role, instruction, goal, context)

    monkeypatch.setattr(main, "complete_agent", fail_during_research)
    assert main.execute_workflow(run_id) is True

    with main.SessionLocal() as db:
        saved = db.get(main.WorkflowRun, run_id)
        assert saved.status == "failed"
        assert saved.current_stage is None
        assert [stage["id"] for stage in saved.stages] == ["plan"]
        failed_event = saved.events[-1]
        assert failed_event["status"] == "failed"
        assert failed_event["stage"] == "research"
        assert failed_event["agent"] == "Scout"
        assert failed_event["message"] == "Research provider temporarily unavailable"


def test_durable_worker_mode_requires_idempotency_keys_for_billable_attempts(client, monkeypatch):
    monkeypatch.setenv("CYRUS_EXTERNAL_WORKER", "true")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-provider-key")
    monkeypatch.setattr(main, "database_is_durable", lambda: True)
    monkeypatch.setattr(main, "worker_is_ready", lambda: True)

    goal = "Create a protected workflow with an idempotent request"
    missing_key = client.post("/api/runs", json={"goal": goal})
    assert missing_key.status_code == 400
    assert "Idempotency-Key" in missing_key.json()["detail"]

    accepted = client.post(
        "/api/runs",
        json={"goal": goal},
        headers={"Idempotency-Key": "cyrus-run-key-123"},
    )
    assert accepted.status_code == 202
    source_id = accepted.json()["item"]["id"]
    with main.SessionLocal() as db:
        source = db.get(main.WorkflowRun, source_id)
        source.status = "failed"
        db.commit()

    missing_retry_key = client.post(f"/api/runs/{source_id}/retry")
    assert missing_retry_key.status_code == 400
    assert "Idempotency-Key" in missing_retry_key.json()["detail"]

    retried = client.post(
        f"/api/runs/{source_id}/retry",
        headers={"Idempotency-Key": "cyrus-retry-key-123"},
    )
    assert retried.status_code == 202
    assert retried.json()["item"]["id"] != source_id
