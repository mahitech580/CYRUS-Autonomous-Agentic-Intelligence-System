import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-cyrus.db")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from main import app, ensure_schema

ensure_schema()


class CyrusApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_contract(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "cyrus-api")
        self.assertIn(response.json()["status"], ["ok", "degraded"])

    def test_agent_registry_has_seven_roles(self):
        response = self.client.get("/api/agents")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 7)
        self.assertEqual(body["items"][0]["id"], "planner")

    def test_rejects_short_goal(self):
        response = self.client.post("/api/runs", json={"goal": "tiny"})
        self.assertEqual(response.status_code, 422)

    def test_create_run_contract(self):
        response = self.client.post("/api/runs", json={"goal": "Build a resilient profile API"})
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertIn("item", body)
        self.assertTrue(body["item"]["id"].startswith("RUN-"))
        self.assertEqual(body["item"]["status"], "queued")
        self.assertEqual(body["item"]["execution_mode"], "deterministic-preview")

    def test_missing_run_is_404(self):
        response = self.client.get("/api/runs/RUN-NOT-REAL")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
