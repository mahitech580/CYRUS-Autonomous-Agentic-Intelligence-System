import unittest
from unittest.mock import patch

import server


class CyrusApiContractTests(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

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

    def test_execute_rejects_invalid_input(self):
        empty = self.client.post("/api/execute", json={"prompt": " "})
        invalid_mode = self.client.post(
            "/api/execute",
            json={"prompt": "Build a service", "mode": "manual"},
        )
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(invalid_mode.status_code, 400)

    def test_missing_task_is_explicit(self):
        response = self.client.get("/api/tasks/CYRUS-MISSING")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Task not found")


if __name__ == "__main__":
    unittest.main()
