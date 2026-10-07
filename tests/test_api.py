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

    def test_history_persistence_round_trip_is_atomic(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            with patch.object(server, "STORE", target):
                server.save_history([{"task_id": "CYRUS-ATOMIC", "status": "COMPLETED"}])
                self.assertEqual(server.load_history()[0]["task_id"], "CYRUS-ATOMIC")

    def test_health_contract(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertIn("system", payload)
        self.assertIn("mode", payload)

    def test_request_id_and_security_headers_are_present(self):
        response = self.client.get("/api/health", headers={"X-Request-ID": "daily-run-12"})
        self.assertEqual(response.headers["X-Request-ID"], "daily-run-12")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Cache-Control"], "no-store")

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

    def test_cancel_running_task_sets_cooperative_event(self):
        cancel_event = __import__("threading").Event()
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-CANCEL"] = {"status": "RUNNING"}
            server.runtime["cancel_events"]["CYRUS-CANCEL"] = cancel_event
        response = self.client.post("/api/tasks/CYRUS-CANCEL/cancel")
        self.assertEqual(response.status_code, 202)
        self.assertTrue(cancel_event.is_set())
        self.assertEqual(response.get_json()["status"], "CANCELLATION_REQUESTED")

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

    def test_missing_task_is_explicit(self):
        response = self.client.get("/api/tasks/CYRUS-MISSING")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Task not found")


if __name__ == "__main__":
    unittest.main()
