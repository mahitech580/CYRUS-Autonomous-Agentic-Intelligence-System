"""Regression tests for bounded supervised approval and task timeout state."""
import threading
import time
import unittest
from unittest.mock import patch

import server


class TaskDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.task = {
            "task_id": "CYRUS-DEADLINE-TEST",
            "current_agent": "REVIEWER",
            "agents": [{"name": "REVIEWER", "status": "RUNNING"}],
            "events": [],
        }
        server.runtime["approval_events"][self.task["task_id"]] = threading.Event()
        server.runtime["cancel_events"][self.task["task_id"]] = threading.Event()
        server.runtime["futures"].pop(self.task["task_id"], None)

    def tearDown(self):
        server.runtime["approval_events"].pop(self.task["task_id"], None)
        server.runtime["cancel_events"].pop(self.task["task_id"], None)
        server.runtime["futures"].pop(self.task["task_id"], None)

    def test_approval_wait_expires_at_task_deadline(self):
        self.task["_runtime_started_monotonic"] = time.perf_counter() - 31
        with patch.object(server, "MAX_TASK_RUNTIME_SECONDS", 30):
            with self.assertRaises(server.TaskTimedOut):
                server.wait_for_supervised_approval(self.task)

    def test_approval_wait_returns_when_operator_approves(self):
        server.runtime["approval_events"][self.task["task_id"]].set()
        self.task["_runtime_started_monotonic"] = time.perf_counter()
        with patch.object(server, "MAX_TASK_RUNTIME_SECONDS", 30):
            server.wait_for_supervised_approval(self.task)

    def test_task_timeout_is_persisted_as_terminal_timed_out_state(self):
        with patch.object(server, "_run_task", side_effect=server.TaskTimedOut("deadline expired")), \
             patch.object(server, "persist_task") as persist:
            server.execute_task(self.task)

        self.assertEqual(self.task["status"], "TIMED_OUT")
        self.assertEqual(self.task["failure"]["type"], "TaskTimedOut")
        self.assertEqual(self.task["agents"][0]["status"], "TIMED_OUT")
        self.assertEqual(self.task["events"][-1]["phase"], "TIMED_OUT")
        persist.assert_called_once_with(self.task)


if __name__ == "__main__":
    unittest.main()
