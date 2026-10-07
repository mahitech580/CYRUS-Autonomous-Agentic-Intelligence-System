import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import server


class CyrusApiContractTests(unittest.TestCase):
    def setUp(self):
        with server.runtime["lock"]:
            server.runtime["tasks"].clear()
            server.runtime["futures"].clear()
            server.runtime["idempotency"].clear()
            server.runtime["cancel_events"].clear()
        self.client = server.app.test_client()

    def test_history_persists_trace_and_agent_state(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            task = {
                "task_id": "CYRUS-DURABLE",
                "created_at": server.now_iso(),
                "updated_at": server.now_iso(),
                "objective": "Persist execution evidence",
                "mode": "autonomous",
                "status": "COMPLETED",
                "current_agent": "RELEASE",
                "plan": ["one"],
                "research": ["evidence"],
                "tests_passed": 4,
                "tests_failed": 0,
                "coverage": 90,
                "quality": 91,
                "latency_ms": 12,
                "agents": [{"name": "RELEASE", "status": "COMPLETED"}],
                "events": [{"event_id": "CYRUS-DURABLE-E001", "agent": "RELEASE"}],
                "artifacts": []
            }
            with patch.object(server, "STORE", target):
                server.persist_task(task)
                persisted = server.load_history()[0]
            self.assertEqual(persisted["events"][0]["event_id"], "CYRUS-DURABLE-E001")
            self.assertEqual(persisted["agents"][0]["status"], "COMPLETED")
            self.assertEqual(persisted["plan"], ["one"])

    def test_history_persistence_round_trip_is_atomic(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            with patch.object(server, "STORE", target):
                server.save_history([{"task_id": "CYRUS-ATOMIC", "status": "COMPLETED"}])
                self.assertEqual(server.load_history()[0]["task_id"], "CYRUS-ATOMIC")

    def test_live_task_store_is_bounded_to_configured_limit(self):
        with server.runtime["lock"]:
            for index in range(server.MAX_LIVE_TASKS):
                server.runtime["tasks"][f"OLD-{index}"] = {
                    "task_id": f"OLD-{index}",
                    "status": "COMPLETED",
                    "updated_at": f"2026-10-07T00:{index % 60:02d}:00Z",
                }
        with patch.object(server, "execute_task", lambda task: None):
            response = self.client.post(
                "/api/execute",
                json={"prompt": "Bound live runtime state", "mode": "autonomous"},
            )
        self.assertEqual(response.status_code, 202)
        with server.runtime["lock"]:
            self.assertLessEqual(len(server.runtime["tasks"]), server.MAX_LIVE_TASKS)

    def test_submission_rolls_back_when_executor_rejects(self):
        original = server.runtime["executor"]
        class RejectingExecutor:
            def submit(self, *args, **kwargs):
                raise RuntimeError("executor unavailable")
        server.runtime["executor"] = RejectingExecutor()
        try:
            with self.assertRaises(RuntimeError):
                server.create_task("executor failure", "autonomous")
            with server.runtime["lock"]:
                self.assertEqual(
                    [t for t in server.runtime["tasks"].values() if t.get("objective") == "executor failure"],
                    [],
                )
        finally:
            server.runtime["executor"] = original

    def test_provider_contract_is_exposed(self):
        response = self.client.get("/api/health")
        payload = response.get_json()
        self.assertEqual(payload["provider"], server.PROVIDER.name)
        self.assertEqual(payload["provider_status"], "ready")
        self.assertEqual(payload["worker_capacity"], server.MAX_CONCURRENT_TASKS)

    def test_provider_generates_deterministic_plan_and_research(self):
        plan = server.PROVIDER.plan("Build a resilient service")
        research = server.PROVIDER.research("Build a resilient service")
        self.assertEqual(len(plan), 6)
        self.assertGreaterEqual(len(research), 4)

    def test_health_contract(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertIn("system", payload)
        self.assertIn("mode", payload)
        self.assertIn("ready", payload)
        self.assertIn("capacity_utilization", payload)

    def test_backend_does_not_expose_private_repository_files(self):
        public_css = self.client.get("/styles.css")
        private_python = self.client.get("/server.py")
        self.assertEqual(public_css.status_code, 200)
        self.assertIn(b"var(--", public_css.data[:2000])
        self.assertEqual(private_python.status_code, 404)

    def test_health_reports_capacity_utilization(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-ACTIVE"] = {"status": "AWAITING_APPROVAL"}
        response = self.client.get("/api/health")
        payload = response.get_json()
        self.assertEqual(payload["active_tasks"], 1)
        self.assertAlmostEqual(
            payload["capacity_utilization"],
            1 / server.MAX_CONCURRENT_TASKS,
            places=3,
        )
        self.assertTrue(payload["ready"])

    def test_readiness_probe_is_healthy_when_capacity_available(self):
        response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ready"])

    def test_readiness_probe_returns_503_when_capacity_is_full(self):
        with server.runtime["lock"]:
            for index in range(server.MAX_CONCURRENT_TASKS):
                server.runtime["tasks"][f"READY-FULL-{index}"] = {"status": "RUNNING"}
        response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["ready"])

    def test_request_id_and_security_headers_are_present(self):
        response = self.client.get("/api/health", headers={"X-Request-ID": "daily-run-12"})
        self.assertEqual(response.headers["X-Request-ID"], "daily-run-12")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertRegex(response.headers["X-Response-Time-Ms"], r"^\d+(\.\d+)?$")
        css = self.client.get("/styles.css")
        self.assertIn("max-age=300", css.headers["Cache-Control"])

    def test_invalid_request_id_is_replaced(self):
        response = self.client.get("/api/health", headers={"X-Request-ID": "bad id!"})
        self.assertRegex(response.headers["X-Request-ID"], r"^[0-9a-f]{32}$")

    def test_agents_and_tools_are_registered(self):
        agents = self.client.get("/api/agents")
        tools = self.client.get("/api/tools")
        self.assertEqual(agents.status_code, 200)
        self.assertEqual(tools.status_code, 200)
        self.assertEqual(len(agents.get_json()), 7)
        self.assertGreaterEqual(len(tools.get_json()), 8)

    def test_execute_accepts_valid_objective(self):
        with patch.object(server, "execute_task", lambda task: None):
            response = self.client.post(
                "/api/execute",
                json={"prompt": "Create a resilient API", "mode": "autonomous"},
            )
        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertTrue(payload["task_id"].startswith("CYRUS-"))
        self.assertEqual(payload["mode"], "autonomous")

    def test_task_listing_supports_status_and_limit_filters(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-ONE"] = {
                "task_id": "CYRUS-ONE", "created_at": "2026-10-07T00:00:00Z",
                "status": "COMPLETED", "objective": "done", "mode": "autonomous"
            }
            server.runtime["tasks"]["CYRUS-TWO"] = {
                "task_id": "CYRUS-TWO", "created_at": "2026-10-07T00:01:00Z",
                "status": "FAILED", "objective": "failed", "mode": "autonomous"
            }
        filtered = self.client.get("/api/tasks?status=FAILED&limit=1")
        self.assertEqual(filtered.status_code, 200)
        rows = filtered.get_json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "FAILED")

    def test_task_listing_rejects_invalid_filters(self):
        bad_limit = self.client.get("/api/tasks?limit=nope")
        bad_status = self.client.get("/api/tasks?status=UNKNOWN")
        self.assertEqual(bad_limit.status_code, 400)
        self.assertEqual(bad_status.status_code, 400)

    def test_execution_rate_limit_returns_retry_after(self):
        from collections import deque
        with server.runtime["lock"]:
            server.runtime["rate_limits"]["127.0.0.1"] = deque(
                [__import__("time").monotonic() for _ in range(server.MAX_EXECUTIONS_PER_MINUTE)]
            )
        response = self.client.post(
            "/api/execute",
            json={"prompt": "Rate limit me", "mode": "autonomous"},
        )
        self.assertEqual(response.status_code, 429)
        self.assertTrue(response.headers.get("Retry-After"))
        self.assertEqual(response.get_json()["retry_after_seconds"], int(response.headers["Retry-After"]))

    def test_execute_requires_json_content_type(self):
        response = self.client.post("/api/execute", data="prompt=x")
        self.assertEqual(response.status_code, 415)
        self.assertIn("application/json", response.get_json()["error"])

    def test_execute_rejects_oversized_objective(self):
        response = self.client.post(
            "/api/execute",
            json={"prompt": "x" * (server.MAX_PROMPT_CHARS + 1), "mode": "autonomous"},
        )
        self.assertEqual(response.status_code, 413)
        self.assertIn("character limit", response.get_json()["error"])

    def test_execute_rejects_invalid_input(self):
        empty = self.client.post("/api/execute", json={"prompt": " "})
        invalid_mode = self.client.post(
            "/api/execute",
            json={"prompt": "Build a service", "mode": "manual"},
        )
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(invalid_mode.status_code, 400)

    def test_runtime_metrics_counts_approval_waiters_as_active(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-WAITING"] = {"status": "AWAITING_APPROVAL"}
        payload = self.client.get("/api/metrics").get_json()
        self.assertEqual(payload["active_tasks"], 1)
        self.assertEqual(payload["awaiting_approval"], 1)

    def test_runtime_metrics_contract(self):
        response = self.client.get("/api/metrics")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["capacity"], server.MAX_CONCURRENT_TASKS)
        self.assertIn("uptime_seconds", payload)
        self.assertIn("average_execution_ms", payload)
        self.assertIn("persisted_tasks", payload)

    def test_execute_is_idempotent_for_repeated_keys(self):
        with patch.object(server, "execute_task", lambda task: None):
            first = self.client.post(
                "/api/execute",
                headers={"Idempotency-Key": "demo-001"},
                json={"prompt": "Create a resilient API", "mode": "autonomous"},
            )
            second = self.client.post(
                "/api/execute",
                headers={"Idempotency-Key": "demo-001"},
                json={"prompt": "Create a resilient API", "mode": "autonomous"},
            )
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.get_json()["deduplicated"])
        self.assertEqual(first.get_json()["task_id"], second.get_json()["task_id"])

    def test_idempotency_recovers_from_persisted_history_after_restart(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            historical = {
                "task_id": "CYRUS-PERSISTED",
                "created_at": server.now_iso(),
                "objective": "Persisted execution",
                "mode": "autonomous",
                "status": "COMPLETED",
                "score": 94,
                "agents": [{"name": "RELEASE", "status": "COMPLETED"}],
                "idempotency_key": "restart-key",
            }
            with patch.object(server, "STORE", target):
                server.save_history([historical])
                with server.runtime["lock"]:
                    server.runtime["tasks"].clear()
                    server.runtime["idempotency"].clear()
                response = self.client.post(
                    "/api/execute",
                    headers={"Idempotency-Key": "restart-key"},
                    json={"prompt": "Persisted execution", "mode": "autonomous"},
                )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["deduplicated"])
        self.assertEqual(payload["task_id"], "CYRUS-PERSISTED")
        self.assertEqual(payload["agents"][0]["name"], "RELEASE")

    def test_idempotency_key_cannot_change_objective(self):
        with patch.object(server, "execute_task", lambda task: None):
            self.client.post(
                "/api/execute",
                headers={"Idempotency-Key": "demo-002"},
                json={"prompt": "Create an API", "mode": "autonomous"},
            )
            conflict = self.client.post(
                "/api/execute",
                headers={"Idempotency-Key": "demo-002"},
                json={"prompt": "Delete an API", "mode": "autonomous"},
            )
        self.assertEqual(conflict.status_code, 409)

    def test_approval_waiters_count_against_worker_capacity(self):
        with server.runtime["lock"]:
            for index in range(server.MAX_CONCURRENT_TASKS - 1):
                server.runtime["tasks"][f"RUNNING-{index}"] = {"status": "RUNNING"}
            server.runtime["tasks"]["AWAITING-APPROVAL"] = {"status": "AWAITING_APPROVAL"}
        response = self.client.post(
            "/api/execute",
            json={"prompt": "Create one more service", "mode": "autonomous"},
        )
        self.assertEqual(response.status_code, 429)

    def test_execute_rejects_when_worker_capacity_is_full(self):
        with server.runtime["lock"]:
            for index in range(server.MAX_CONCURRENT_TASKS):
                server.runtime["tasks"][f"RUNNING-{index}"] = {"status": "RUNNING"}
        response = self.client.post(
            "/api/execute",
            json={"prompt": "Create another service", "mode": "autonomous"},
        )
        self.assertEqual(response.status_code, 429)
        self.assertIn("capacity", response.get_json()["error"].lower())

    def test_approval_grant_wakes_supervised_task(self):
        approval_event = __import__("threading").Event()
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-APPROVE"] = {"status": "AWAITING_APPROVAL"}
            server.runtime["approval_events"]["CYRUS-APPROVE"] = approval_event
        response = self.client.post("/api/tasks/CYRUS-APPROVE/approve")
        self.assertEqual(response.status_code, 202)
        self.assertTrue(approval_event.is_set())
        self.assertIn("approval_requested_at", server.runtime["tasks"]["CYRUS-APPROVE"])

    def test_approval_is_rejected_when_not_pending(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-NOAPPROVE"] = {"status": "COMPLETED"}
        response = self.client.post("/api/tasks/CYRUS-NOAPPROVE/approve")
        self.assertEqual(response.status_code, 409)

    def test_supervised_execution_hits_approval_checkpoint_and_releases(self):
        task = {
            "task_id": "CYRUS-SUPERVISED",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            "objective": "Verify supervised release gate",
            "mode": "supervised",
            "status": "RUNNING",
            "current_agent": "ORCHESTRATOR",
            "plan": [],
            "research": [],
            "tool_calls": 0,
            "artifacts": [],
            "tests_passed": 0,
            "tests_failed": 0,
            "coverage": 0,
            "quality": 0,
            "risk": "MEDIUM",
            "confidence": 0,
            "score": 0,
            "latency_ms": 0,
            "execution_time_ms": 0,
            "summary": "",
            "events": [],
            "agents": [dict(agent, status="QUEUED") for agent in server.AGENTS],
        }
        with server.runtime["lock"]:
            server.runtime["approval_events"][task["task_id"]] = __import__("threading").Event()
            server.runtime["cancel_events"][task["task_id"]] = __import__("threading").Event()
        with patch.object(server, "persist_task"), patch.object(server, "cooperative_wait", lambda value, seconds: None), patch.object(
            server, "wait_for_supervised_approval", lambda value: None
        ):
            server._run_task(task)
        self.assertEqual(task["status"], "COMPLETED")
        self.assertFalse(task["approval_required"])
        self.assertTrue(any(event["phase"] == "APPROVED" for event in task["events"]))
        self.assertEqual(task["current_agent"], "RELEASE")

    def test_cancel_running_task_sets_cooperative_event(self):
        cancel_event = __import__("threading").Event()
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-CANCEL"] = {"status": "RUNNING"}
            server.runtime["cancel_events"]["CYRUS-CANCEL"] = cancel_event
        response = self.client.post("/api/tasks/CYRUS-CANCEL/cancel")
        self.assertEqual(response.status_code, 202)
        self.assertTrue(cancel_event.is_set())
        self.assertEqual(response.get_json()["status"], "CANCELLATION_REQUESTED")
        with server.runtime["lock"]:
            self.assertTrue(server.runtime["tasks"]["CYRUS-CANCEL"]["cancel_requested"])
            self.assertEqual(server.runtime["tasks"]["CYRUS-CANCEL"]["events"][-1]["phase"], "CANCEL_REQUESTED")

    def test_cancel_non_running_task_is_rejected(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-DONE"] = {"status": "COMPLETED"}
        response = self.client.post("/api/tasks/CYRUS-DONE/cancel")
        self.assertEqual(response.status_code, 409)

    def test_worker_cancellation_marks_task_cancelled(self):
        task = {
            "task_id": "CYRUS-CANCELTEST",
            "status": "RUNNING",
            "current_agent": "CODER",
            "events": [],
            "updated_at": "",
        }
        with patch.object(server, "_run_task", side_effect=server.TaskCancelled("operator stop")):
            with patch.object(server, "persist_task"):
                server.execute_task(task)
        self.assertEqual(task["status"], "CANCELLED")
        self.assertIn("cancelled", task["summary"].lower())

    def test_worker_failure_marks_task_failed(self):
        task = {
            "task_id": "CYRUS-FAILTEST",
            "status": "RUNNING",
            "current_agent": "CODER",
            "events": [],
            "updated_at": "",
        }
        with patch.object(server, "_run_task", side_effect=RuntimeError("synthetic failure")):
            with patch.object(server, "persist_task"):
                server.execute_task(task)
        self.assertEqual(task["status"], "FAILED")
        self.assertEqual(task["failure"]["type"], "RuntimeError")
        self.assertIn("internal runtime failure", task["summary"])

    def test_event_telemetry_has_stable_ids_and_timestamps(self):
        task = {"task_id": "CYRUS-EVENTS", "events": []}
        server.event(task, "TESTER", "VALIDATION", "Synthetic event", 15)
        event = task["events"][0]
        self.assertEqual(event["event_id"], "CYRUS-EVENTS-E001")
        self.assertRegex(event["timestamp"], r"^\d{4}-\d{2}-\d{2}T")
        self.assertEqual(event["duration"], 15)

    def test_unknown_route_preserves_http_404(self):
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.get_json()["error"].lower())

    def test_method_not_allowed_preserves_http_405(self):
        response = self.client.put("/api/health")
        self.assertEqual(response.status_code, 405)
        self.assertIn("method", response.get_json()["error"].lower())

    def test_missing_task_is_explicit(self):
        response = self.client.get("/api/tasks/CYRUS-MISSING")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Task not found")


if __name__ == "__main__":
    unittest.main()
