import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import server


def task_record(task_id, objective, status, duration, failure=None):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "task_id": task_id,
        "created_at": now,
        "updated_at": now,
        "objective": objective,
        "mode": "autonomous",
        "status": status,
        "current_agent": "RELEASE" if status == "COMPLETED" else "REVIEWER",
        "score": 0,
        "execution_time_ms": duration,
        "confidence": 0,
        "quality": 0,
        "coverage": 0,
        "risk": "MEDIUM",
        "summary": "fixture record",
        "tool_calls": 0,
        "tests_passed": 0,
        "tests_failed": 0,
        "artifact_count": 0,
        "event_count": 1,
        "provider": "test-provider",
        "verification_status": "PLAN_GENERATED_NOT_EXECUTED",
        "score_method": "UNSCORED",
        "static_analysis": {},
        "failure": failure,
        "agents": [],
        "events": [],
        "artifacts": [],
    }


class AnalyticsApiTests(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()
        self.records = [
            task_record("CYRUS-ANALYTIC1", "Deepfake review dashboard", "COMPLETED", 1500),
            task_record("CYRUS-ANALYTIC2", "Deepfake parsing failure", "FAILED", 500, {
                "type": "ProviderError",
                "message": "provider unavailable",
            }),
        ]
        self.runtime_patch = patch.dict(server.runtime["tasks"], {}, clear=True)
        self.runtime_patch.start()
        self.addCleanup(self.runtime_patch.stop)

    def test_analytics_computes_real_counts_rates_and_timing_from_records(self):
        with patch("server.load_history", return_value=self.records):
            response = self.client.get("/api/analytics?days=7")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["totals"]["all"], 2)
        self.assertEqual(payload["totals"]["completed"], 1)
        self.assertEqual(payload["totals"]["failed"], 1)
        self.assertEqual(payload["totals"]["success_rate"], 50.0)
        self.assertEqual(sum(day["total"] for day in payload["daily"]), 2)
        self.assertEqual(payload["latency"]["average_ms"], 1000.0)
        self.assertEqual(payload["latency"]["p95_ms"], 1500)
        self.assertEqual(payload["failure_types"][0]["type"], "ProviderError")
        self.assertEqual(payload["providers"][0]["name"], "test-provider")

    def test_analytics_measures_retry_outcomes_recovery_and_depth(self):
        original_a = task_record(
            "CYRUS-RETRY-ROOT-A", "Retry analytics", "FAILED", 250,
            {"type": "ProviderError", "message": "synthetic failure"},
        )
        retry_a = task_record("CYRUS-RETRY-A-1", "Retry analytics", "COMPLETED", 700)
        retry_a.update(parent_task_id=original_a["task_id"], retry_number=1, max_task_retries=3)

        original_b = task_record(
            "CYRUS-RETRY-ROOT-B", "Retry analytics", "TIMED_OUT", 1000,
            {"type": "TaskTimedOut", "message": "synthetic timeout"},
        )
        retry_b1 = task_record("CYRUS-RETRY-B-1", "Retry analytics", "FAILED", 400)
        retry_b1.update(parent_task_id=original_b["task_id"], retry_number=1, max_task_retries=3)
        retry_b2 = task_record("CYRUS-RETRY-B-2", "Retry analytics", "COMPLETED", 600)
        retry_b2.update(
            parent_task_id=retry_b1["task_id"],
            retry_number=2,
            retry_reason="FAILED:ProviderError",
            max_task_retries=3,
        )
        records = [original_a, retry_a, original_b, retry_b1, retry_b2]

        with patch("server.load_history", return_value=records):
            response = self.client.get("/api/analytics?days=7")

        self.assertEqual(response.status_code, 200)
        retry_data = response.get_json()["retry_outcomes"]
        self.assertEqual(retry_data["total_attempts"], 3)
        self.assertEqual(retry_data["lineages_with_retries"], 2)
        self.assertEqual(retry_data["completed"], 2)
        self.assertEqual(retry_data["failed"], 1)
        self.assertEqual(retry_data["timed_out"], 0)
        self.assertEqual(retry_data["active"], 0)
        self.assertEqual(retry_data["terminal"], 3)
        self.assertEqual(retry_data["completion_rate"], 66.7)
        self.assertEqual(retry_data["eligible_after_failure"], 3)
        self.assertEqual(retry_data["resolved_after_failure"], 3)
        self.assertEqual(retry_data["recovered_after_failure"], 2)
        self.assertEqual(retry_data["recovery_rate"], 66.7)
        self.assertEqual(retry_data["max_depth"], 2)
        self.assertEqual(
            [(item["retry_number"], item["total"], item["completed"], item["failed"]) for item in retry_data["by_depth"]],
            [(1, 2, 1, 1), (2, 1, 1, 0)],
        )

    def test_task_list_supports_backend_search_and_mode_filter(self):
        with patch("server.load_history", return_value=self.records):
            response = self.client.get("/api/tasks?q=deepfake&mode=autonomous&limit=10")
        self.assertEqual(response.status_code, 200)
        results = response.get_json()
        self.assertEqual(len(results), 2)
        self.assertTrue(all("Deepfake" in item["objective"] for item in results))

    def test_task_search_can_find_agent_and_mode_fields(self):
        with patch("server.load_history", return_value=self.records):
            agent_response = self.client.get("/api/tasks?q=reviewer")
            mode_response = self.client.get("/api/tasks?q=autonomous")
        self.assertEqual(agent_response.status_code, 200)
        self.assertEqual([item["task_id"] for item in agent_response.get_json()], ["CYRUS-ANALYTIC2"])
        self.assertEqual(len(mode_response.get_json()), 2)

    def test_analytics_rejects_invalid_window(self):
        response = self.client.get("/api/analytics?days=hundred")
        self.assertEqual(response.status_code, 400)
        self.assertIn("days must be an integer", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
