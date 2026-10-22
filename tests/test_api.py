import unittest
import threading
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import server
from providers import DeterministicProvider
from storage import HistoryStore


class CyrusApiContractTests(unittest.TestCase):
    def setUp(self):
        with server.runtime["lock"]:
            server.runtime["tasks"].clear()
            server.runtime["futures"].clear()
            server.runtime["idempotency"].clear()
            server.runtime["cancel_events"].clear()
            server.runtime["retry_reservations"].clear()
            server.runtime["rate_limits"].clear()
        self.client = server.app.test_client()

    def test_recovery_marks_interrupted_runs_failed_and_preserves_terminal_runs(self):
        records = [
            {
                "task_id": "CYRUS-INTERRUPTED",
                "created_at": server.now_iso(),
                "status": "RUNNING",
                "current_agent": "CODER",
                "verification_status": "PENDING",
                "agents": [
                    {"name": "PLANNER", "status": "COMPLETED"},
                    {"name": "CODER", "status": "RUNNING"},
                ],
                "events": [{"event_id": "CYRUS-INTERRUPTED-E001", "phase": "STARTED"}],
            },
            {
                "task_id": "CYRUS-ALREADY-DONE",
                "created_at": server.now_iso(),
                "status": "COMPLETED",
                "events": [],
            },
        ]
        with TemporaryDirectory() as tmp:
            store = HistoryStore(Path(tmp) / "history.sqlite3")
            with patch("server.load_history", return_value=records), patch("server.save_history", side_effect=store.save_all):
                recovered = server.recover_interrupted_runs()
            self.assertEqual(recovered, 1)
            stored = {item["task_id"]: item for item in store.load_all()}
        interrupted = stored["CYRUS-INTERRUPTED"]
        self.assertEqual(interrupted["status"], "FAILED")
        self.assertEqual(interrupted["verification_status"], "INTERRUPTED_NOT_VERIFIED")
        self.assertEqual(interrupted["failure"]["type"], "RuntimeRestart")
        self.assertEqual(interrupted["agents"][0]["status"], "COMPLETED")
        self.assertEqual(interrupted["agents"][1]["status"], "FAILED")
        self.assertEqual(interrupted["events"][-1]["event_id"], "CYRUS-INTERRUPTED-E002")
        self.assertEqual(stored["CYRUS-ALREADY-DONE"]["status"], "COMPLETED")

    def test_history_persists_trace_and_agent_state(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            task = {
                "task_id": "CYRUS-DURABLE",
                "created_at": server.now_iso(),
                "updated_at": server.now_iso(),
                "objective": "Persist execution evidence",
                "tool_calls": 7,
                "parent_task_id": "CYRUS-DURABLE-PARENT",
                "retry_number": 2,
                "retry_reason": "TIMED_OUT:TaskTimedOut",
                "max_task_retries": 4,
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
            with patch.object(server, "STORE", target), patch.object(server, "HISTORY_STORE", HistoryStore(target.with_suffix(".sqlite3"))):
                server.persist_task(task)
                persisted = server.load_history()[0]
            self.assertEqual(persisted["events"][0]["event_id"], "CYRUS-DURABLE-E001")
            self.assertEqual(persisted["agents"][0]["status"], "COMPLETED")
            self.assertEqual(persisted["plan"], ["one"])
            self.assertEqual(persisted["updated_at"], task["updated_at"])
            self.assertEqual(persisted["tool_calls"], 7)
            self.assertEqual(persisted["latency_ms"], 12)
            self.assertEqual(persisted["parent_task_id"], "CYRUS-DURABLE-PARENT")
            self.assertEqual(persisted["retry_number"], 2)
            self.assertEqual(persisted["retry_reason"], "TIMED_OUT:TaskTimedOut")
            self.assertEqual(persisted["max_task_retries"], 4)

    def test_history_persistence_round_trip_is_atomic(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            with patch.object(server, "STORE", target), patch.object(server, "HISTORY_STORE", HistoryStore(target.with_suffix(".sqlite3"))):
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

    def test_completed_future_is_not_retained_when_worker_finishes_during_submit(self):
        class CompletedFuture:
            def done(self):
                return True

        class ImmediateExecutor:
            def submit(self, callback, task):
                # Force the worker cleanup to happen before submit returns its Future.
                callback(task)
                return CompletedFuture()

        def finish_immediately(task):
            with server.runtime["lock"]:
                task["status"] = "COMPLETED"
                server.runtime["futures"].pop(task["task_id"], None)
                server.runtime["cancel_events"].pop(task["task_id"], None)
                server.runtime["approval_events"].pop(task["task_id"], None)

        original_executor = server.runtime["executor"]
        server.runtime["executor"] = ImmediateExecutor()
        try:
            with patch.object(server, "execute_task", side_effect=finish_immediately):
                task = server.create_task("Finish before future registration", "autonomous")
            with server.runtime["lock"]:
                self.assertEqual(task["status"], "COMPLETED")
                self.assertNotIn(task["task_id"], server.runtime["futures"])
                self.assertNotIn(task["task_id"], server.runtime["cancel_events"])
                self.assertNotIn(task["task_id"], server.runtime["approval_events"])
        finally:
            server.runtime["executor"] = original_executor

    def test_retry_creates_new_task_with_persistent_lineage_and_deduplicates(self):
        source = {
            "task_id": "CYRUS-RETRY-SOURCE",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            "objective": "Re-run the interrupted objective",
            "mode": "supervised",
            "status": "TIMED_OUT",
            "retry_number": 0,
            "failure": {"type": "TaskTimedOut", "message": "deadline elapsed"},
            "events": [],
        }
        with server.runtime["lock"]:
            server.runtime["tasks"][source["task_id"]] = source

        class CompletedFuture:
            def done(self):
                return True

        class InlineExecutor:
            def submit(self, callback, task):
                callback(task)
                return CompletedFuture()

        original_executor = server.runtime["executor"]
        server.runtime["executor"] = InlineExecutor()
        try:
            with patch.object(server, "execute_task", lambda task: None):
                first = self.client.post(
                    "/api/tasks/CYRUS-RETRY-SOURCE/retry",
                    headers={"Idempotency-Key": "retry-timeout-001"},
                )
                second = self.client.post(
                    "/api/tasks/CYRUS-RETRY-SOURCE/retry",
                    headers={"Idempotency-Key": "retry-timeout-001"},
                )
                third = self.client.post(
                    "/api/tasks/CYRUS-RETRY-SOURCE/retry",
                    headers={"Idempotency-Key": "retry-timeout-002"},
                )
        finally:
            server.runtime["executor"] = original_executor

        self.assertEqual(first.status_code, 202)
        created = first.get_json()
        self.assertEqual(created["retry_of"], source["task_id"])
        self.assertEqual(created["retry_number"], 1)
        self.assertEqual(created["mode"], "supervised")
        self.assertFalse(created["deduplicated"])
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.get_json()["deduplicated"])
        self.assertEqual(second.get_json()["task_id"], created["task_id"])
        self.assertEqual(third.status_code, 200)
        self.assertTrue(third.get_json()["deduplicated"])
        self.assertEqual(third.get_json()["task_id"], created["task_id"])
        with server.runtime["lock"]:
            retried = server.runtime["tasks"][created["task_id"]]
            self.assertEqual(retried["parent_task_id"], source["task_id"])
            self.assertEqual(retried["retry_number"], 1)
            self.assertEqual(retried["retry_reason"], "TIMED_OUT:TaskTimedOut")
            self.assertEqual(retried["events"][0]["phase"], "RETRY_CREATED")
            self.assertNotIn(created["task_id"], server.runtime["futures"])

    def test_retry_reservation_prevents_parallel_children_with_different_keys(self):
        source = {
            "task_id": "CYRUS-RETRY-RACE-SOURCE",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            "objective": "Serialize retry submission",
            "mode": "autonomous",
            "status": "FAILED",
            "retry_number": 0,
            "failure": {"type": "RuntimeError", "message": "synthetic"},
            "events": [],
        }
        with server.runtime["lock"]:
            server.runtime["tasks"][source["task_id"]] = source

        lookup_started = threading.Event()
        allow_lookup = threading.Event()
        original_all_task_records = server.all_task_records
        responses = {}

        def pause_first_lineage_scan():
            lookup_started.set()
            if not allow_lookup.wait(timeout=3):
                raise RuntimeError("test did not release retry lineage scan")
            return original_all_task_records()

        def first_request():
            with server.app.test_client() as client:
                responses["first"] = client.post(
                    "/api/tasks/CYRUS-RETRY-RACE-SOURCE/retry",
                    headers={"Idempotency-Key": "retry-race-key-one"},
                )

        original_executor = server.runtime["executor"]
        class InlineExecutor:
            def submit(self, callback, task):
                callback(task)
                class CompletedFuture:
                    def done(self):
                        return True
                return CompletedFuture()

        server.runtime["executor"] = InlineExecutor()
        worker = threading.Thread(target=first_request)
        try:
            with patch.object(server, "all_task_records", side_effect=pause_first_lineage_scan), \
                 patch.object(server, "execute_task", lambda task: None):
                worker.start()
                self.assertTrue(lookup_started.wait(timeout=2))
                second = self.client.post(
                    "/api/tasks/CYRUS-RETRY-RACE-SOURCE/retry",
                    headers={"Idempotency-Key": "retry-race-key-two"},
                )
                allow_lookup.set()
                worker.join(timeout=3)
        finally:
            allow_lookup.set()
            worker.join(timeout=3)
            server.runtime["executor"] = original_executor

        self.assertFalse(worker.is_alive())
        self.assertEqual(responses["first"].status_code, 202)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.get_json()["status"], "RETRY_IN_PROGRESS")
        with server.runtime["lock"]:
            children = [
                task for task in server.runtime["tasks"].values()
                if task.get("parent_task_id") == source["task_id"]
            ]
            self.assertEqual(len(children), 1)
            self.assertNotIn("retry-race-key-two", server.runtime["idempotency"])

    def test_retry_lineage_cap_is_persisted_and_live_cap_is_stricter(self):
        source = {
            "task_id": "CYRUS-RETRY-POLICY-SOURCE",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            "objective": "Respect recorded and active retry caps",
            "mode": "autonomous",
            "status": "FAILED",
            "retry_number": 0,
            "max_task_retries": 3,
            "failure": {"type": "RuntimeError", "message": "synthetic"},
            "events": [],
        }
        with server.runtime["lock"]:
            server.runtime["tasks"][source["task_id"]] = source

        with patch.object(server, "MAX_TASK_RETRIES", 1), patch.object(
            server, "execute_task", lambda task: None
        ):
            first = self.client.post(
                "/api/tasks/CYRUS-RETRY-POLICY-SOURCE/retry",
                headers={"Idempotency-Key": "retry-policy-first"},
            )
            child_id = first.get_json()["task_id"]
            detail = self.client.get("/api/tasks/" + child_id).get_json()
            with server.runtime["lock"]:
                server.runtime["tasks"][child_id]["status"] = "FAILED"
            exhausted = self.client.post(
                "/api/tasks/" + child_id + "/retry",
                headers={"Idempotency-Key": "retry-policy-second"},
            )

        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.get_json()["max_task_retries"], 3)
        self.assertEqual(first.get_json()["effective_max_task_retries"], 1)
        self.assertEqual(detail["max_task_retries"], 3)
        self.assertEqual(detail["effective_max_task_retries"], 1)
        self.assertEqual(exhausted.status_code, 409)
        self.assertEqual(exhausted.get_json()["max_task_retries"], 3)
        self.assertEqual(exhausted.get_json()["effective_max_task_retries"], 1)

    def test_recovery_guidance_classifies_timeout_and_does_not_echo_raw_errors(self):
        task = {
            "task_id": "CYRUS-RECOVERY-TIMEOUT",
            "status": "TIMED_OUT",
            "mode": "autonomous",
            "failure": {"type": "TaskTimedOut", "message": "Bearer very-secret-value"},
            "verification_status": "PLAN_GENERATED_NOT_EXECUTED",
            "max_task_retries": 3,
        }
        with patch.object(server, "all_task_records", return_value=[task]):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-TIMEOUT/recovery")
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["schema_version"], 1)
        self.assertEqual(result["category"], "timeout")
        self.assertTrue(result["can_retry"])
        self.assertIn("deadline", result["headline"].lower())
        self.assertNotIn("very-secret-value", response.get_data(as_text=True))
        self.assertEqual(result["source"], "deterministic_runtime_guidance")

    def test_recovery_guidance_identifies_synthetic_demo_without_overstating_validation(self):
        task = {
            "task_id": "DEMO-RECOVERY-FAILED",
            "status": "FAILED",
            "mode": "autonomous",
            "provider": "browser-demo",
            "verification_status": "SYNTHETIC_DEMO_ONLY",
            "failure": {"type": "DemoFailure", "message": "Synthetic only"},
        }
        with patch.object(server, "all_task_records", return_value=[task]):
            response = self.client.get("/api/tasks/DEMO-RECOVERY-FAILED/recovery")
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["category"], "synthetic_demo")
        self.assertTrue(result["synthetic_demo"])
        self.assertTrue(result["can_retry"])
        self.assertIn("did not call", result["explanation"].lower())
        self.assertIn("not use the synthetic score", " ".join(result["steps"]).lower())

    def test_recovery_guidance_recommends_configuration_fix_before_retry(self):
        task = {
            "task_id": "CYRUS-RECOVERY-CONFIG",
            "status": "FAILED",
            "mode": "autonomous",
            "provider": "openai",
            "failure": {"type": "ProviderAuthenticationError", "message": "Credential sentinel-do-not-echo"},
        }
        with patch.object(server, "all_task_records", return_value=[task]):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-CONFIG/recovery")
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["category"], "provider_configuration")
        self.assertIn("first", result["retry_guidance"].lower())
        self.assertNotIn("sentinel-do-not-echo", response.get_data(as_text=True))

    def test_recovery_guidance_handles_provider_network_failures(self):
        task = {
            "task_id": "CYRUS-RECOVERY-NETWORK",
            "status": "FAILED",
            "mode": "autonomous",
            "provider": "openai",
            "failure": {"type": "ProviderConnectionError", "message": "connection data"},
        }
        with patch.object(server, "all_task_records", return_value=[task]):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-NETWORK/recovery")
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["category"], "provider_or_network")
        self.assertIn("rate limits", " ".join(result["steps"]).lower())
        self.assertIn("may incur", result["retry_guidance"].lower())

    def test_recovery_guidance_tokenizes_exception_names_without_false_matches(self):
        fixtures = [
            ("GeneratedArtifactError", "execution_failure", "inspect_last_successful_stage"),
            ("RateLimitExceededError", "rate_limited", "wait_for_provider_reset"),
            ("HTTP429Error", "rate_limited", "wait_for_provider_reset"),
            ("ProviderConnectionError", "provider_or_network", "check_provider_connectivity"),
            ("DeadlineExceededError", "timeout", "reduce_scope_and_inspect_trace"),
            ("APIKeyMissingError", "provider_configuration", "correct_provider_configuration"),
            ("UnauthorizedError", "provider_configuration", "correct_provider_configuration"),
            ("TooManyRequestsError", "rate_limited", "wait_for_provider_reset"),
            ("ServiceUnavailableError", "provider_or_network", "check_provider_connectivity"),
            ("TimedOutError", "timeout", "reduce_scope_and_inspect_trace"),
        ]
        for failure_type, expected_category, expected_action in fixtures:
            task = {
                "task_id": "CYRUS-TOKEN-" + failure_type,
                "status": "FAILED",
                "mode": "autonomous",
                "provider": "test-provider",
                "failure": {
                    "type": failure_type,
                    "message": "sensitive test payload must not appear",
                },
            }
            with self.subTest(failure_type=failure_type), patch.object(
                server, "all_task_records", return_value=[task]
            ):
                response = self.client.get(
                    "/api/tasks/" + task["task_id"] + "/recovery"
                )
            self.assertEqual(response.status_code, 200)
            result = response.get_json()
            self.assertEqual(result["category"], expected_category)
            self.assertEqual(result["recommended_action"], expected_action)
            self.assertNotIn("sensitive test payload", response.get_data(as_text=True))
            if expected_category == "rate_limited":
                self.assertIn("reset window", result["retry_guidance"])

    def test_recovery_guidance_distinguishes_cancelled_completed_and_active_states(self):
        fixtures = [
            ({"task_id": "RECOVERY-CANCELLED", "status": "CANCELLED", "max_task_retries": 2}, "cancelled", True),
            ({"task_id": "RECOVERY-COMPLETED", "status": "COMPLETED", "max_task_retries": 2}, "completed", False),
            ({"task_id": "RECOVERY-RUNNING", "status": "RUNNING", "max_task_retries": 2}, "in_progress", False),
            ({"task_id": "RECOVERY-APPROVAL", "status": "AWAITING_APPROVAL", "max_task_retries": 2}, "in_progress", False),
        ]
        for task, category, retryable in fixtures:
            with self.subTest(task=task["task_id"]), patch.object(server, "all_task_records", return_value=[task]):
                response = self.client.get("/api/tasks/" + task["task_id"] + "/recovery")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()["category"], category)
            self.assertEqual(response.get_json()["can_retry"], retryable)

    def test_recovery_guidance_uses_generic_safe_fallback_for_unknown_failures(self):
        task = {
            "task_id": "CYRUS-RECOVERY-UNKNOWN",
            "status": "FAILED",
            "mode": "autonomous",
            "failure": {"type": "UnexpectedInternalThing", "message": "raw private diagnostic"},
        }
        with patch.object(server, "all_task_records", return_value=[task]):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-UNKNOWN/recovery")
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["category"], "execution_failure")
        self.assertNotIn("raw private diagnostic", response.get_data(as_text=True))
        self.assertIn("last successful stage", " ".join(result["steps"]).lower())

    def test_recovery_guidance_respects_a_stricter_active_retry_cap(self):
        task = {
            "task_id": "CYRUS-RECOVERY-CAP",
            "status": "TIMED_OUT",
            "mode": "autonomous",
            "max_task_retries": 3,
            "retry_number": 0,
        }
        with patch.object(server, "all_task_records", return_value=[task]), patch.object(
            server, "MAX_TASK_RETRIES", 0
        ):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-CAP/recovery")

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["max_task_retries"], 3)
        self.assertEqual(result["effective_max_task_retries"], 0)
        self.assertFalse(result["can_retry"])

    def test_recovery_guidance_returns_404_for_unknown_task(self):
        with patch.object(server, "all_task_records", return_value=[]):
            response = self.client.get("/api/tasks/CYRUS-RECOVERY-MISSING/recovery")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Task not found")

    def test_task_lineage_returns_root_to_leaf_summaries_from_live_state(self):
        records = [
            {
                "task_id": "CYRUS-LINEAGE-ROOT",
                "created_at": "2026-10-20T10:00:00Z",
                "objective": "Inspect retryable behavior",
                "mode": "autonomous",
                "status": "TIMED_OUT",
                "retry_number": 0,
                "max_task_retries": 3,
                "events": [],
                "implementation": "must not appear in a lineage summary",
            },
            {
                "task_id": "CYRUS-LINEAGE-RETRY-1",
                "created_at": "2026-10-20T10:01:00Z",
                "objective": "Inspect retryable behavior",
                "mode": "autonomous",
                "status": "FAILED",
                "parent_task_id": "CYRUS-LINEAGE-ROOT",
                "retry_number": 1,
                "max_task_retries": 3,
                "retry_reason": "TIMED_OUT:TaskTimedOut",
                "events": [],
                "implementation": "must not appear in a lineage summary",
            },
            {
                "task_id": "CYRUS-LINEAGE-RETRY-2",
                "created_at": "2026-10-20T10:02:00Z",
                "objective": "Inspect retryable behavior",
                "mode": "autonomous",
                "status": "RUNNING",
                "parent_task_id": "CYRUS-LINEAGE-RETRY-1",
                "retry_number": 2,
                "max_task_retries": 3,
                "events": [],
                "implementation": "must not appear in a lineage summary",
            },
            {
                "task_id": "CYRUS-UNRELATED",
                "created_at": "2026-10-20T10:03:00Z",
                "objective": "An unrelated execution",
                "mode": "autonomous",
                "status": "COMPLETED",
                "events": [],
            },
        ]
        with server.runtime["lock"]:
            for item in records:
                server.runtime["tasks"][item["task_id"]] = item
        with patch.object(server, "load_history", return_value=[]):
            response = self.client.get("/api/tasks/CYRUS-LINEAGE-RETRY-1/lineage")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["current_task_id"], "CYRUS-LINEAGE-RETRY-1")
        self.assertEqual(payload["root_task_id"], "CYRUS-LINEAGE-ROOT")
        self.assertEqual(payload["attempt_count"], 3)
        self.assertFalse(payload["truncated"])
        self.assertEqual(
            [item["task_id"] for item in payload["attempts"]],
            ["CYRUS-LINEAGE-ROOT", "CYRUS-LINEAGE-RETRY-1", "CYRUS-LINEAGE-RETRY-2"],
        )
        self.assertTrue(payload["attempts"][0]["can_retry"])
        self.assertEqual(payload["attempts"][1]["parent_task_id"], "CYRUS-LINEAGE-ROOT")
        self.assertEqual(payload["attempts"][1]["retry_reason"], "TIMED_OUT:TaskTimedOut")
        self.assertNotIn("implementation", payload["attempts"][0])
        self.assertNotIn("CYRUS-UNRELATED", str(payload))

    def test_task_lineage_preserves_root_for_a_chain_deeper_than_display_cap(self):
        with server.runtime["lock"]:
            for index in range(60):
                task_id = "CYRUS-LINEAR-" + str(index).zfill(3)
                server.runtime["tasks"][task_id] = {
                    "task_id": task_id,
                    "objective": "A long retry chain",
                    "mode": "autonomous",
                    "status": "FAILED" if index < 59 else "TIMED_OUT",
                    "created_at": "2026-10-20T10:" + str(index % 60).zfill(2) + ":00Z",
                    "retry_number": index,
                    "max_task_retries": 10,
                    "parent_task_id": "CYRUS-LINEAR-" + str(index - 1).zfill(3) if index else None,
                }
        with patch.object(server, "load_history", return_value=[]):
            response = self.client.get("/api/tasks/CYRUS-LINEAR-059/lineage")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["root_task_id"], "CYRUS-LINEAR-000")
        self.assertEqual(payload["attempt_count"], 50)
        self.assertTrue(payload["truncated"])
        self.assertEqual(payload["attempts"][0]["task_id"], "CYRUS-LINEAR-000")
        self.assertEqual(payload["attempts"][-1]["task_id"], "CYRUS-LINEAR-059")
        self.assertEqual(len({item["task_id"] for item in payload["attempts"]}), 50)

    def test_task_lineage_works_for_legacy_historical_records_and_missing_tasks(self):
        historical = [
            {
                "task_id": "CYRUS-HISTORY-ROOT",
                "objective": "Legacy record",
                "mode": "autonomous",
                "status": "FAILED",
                "created_at": "2026-10-20T09:00:00Z",
                "artifacts": None,
                "events": None,
                "static_analysis": None,
            },
            {
                "task_id": "CYRUS-HISTORY-RETRY",
                "objective": "Legacy record",
                "mode": "autonomous",
                "status": "TIMED_OUT",
                "created_at": "2026-10-20T09:01:00Z",
                "parent_task_id": "CYRUS-HISTORY-ROOT",
                "retry_number": 1,
            },
        ]
        with patch.object(server, "load_history", return_value=historical):
            response = self.client.get("/api/tasks/CYRUS-HISTORY-RETRY/lineage")
            missing = self.client.get("/api/tasks/CYRUS-HISTORY-MISSING/lineage")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["attempt_count"], 2)
        self.assertEqual(response.get_json()["attempts"][0]["retry_number"], 0)
        self.assertEqual(response.get_json()["attempts"][0]["artifact_count"], 0)
        self.assertEqual(response.get_json()["attempts"][0]["event_count"], 0)
        self.assertEqual(response.get_json()["attempts"][0]["static_checks_passed"], 0)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.get_json()["error"], "Task not found")

    def test_task_lineage_cycle_does_not_loop_forever(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-CYCLE-A"] = {
                "task_id": "CYRUS-CYCLE-A",
                "objective": "Malformed lineage",
                "mode": "autonomous",
                "status": "FAILED",
                "parent_task_id": "CYRUS-CYCLE-B",
                "retry_number": 1,
            }
            server.runtime["tasks"]["CYRUS-CYCLE-B"] = {
                "task_id": "CYRUS-CYCLE-B",
                "objective": "Malformed lineage",
                "mode": "autonomous",
                "status": "FAILED",
                "parent_task_id": "CYRUS-CYCLE-A",
                "retry_number": 2,
            }
        with patch.object(server, "load_history", return_value=[]):
            response = self.client.get("/api/tasks/CYRUS-CYCLE-A/lineage")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["attempt_count"], 2)
        self.assertEqual(
            {item["task_id"] for item in payload["attempts"]},
            {"CYRUS-CYCLE-A", "CYRUS-CYCLE-B"},
        )
        self.assertFalse(payload["truncated"])

    def test_task_lineage_caps_large_histories_and_marks_truncation(self):
        root = {
            "task_id": "CYRUS-LINEAGE-CAP-ROOT",
            "objective": "Bound retry history",
            "mode": "autonomous",
            "status": "TIMED_OUT",
            "retry_number": 0,
            "created_at": "2026-10-20T10:00:00Z",
        }
        with server.runtime["lock"]:
            server.runtime["tasks"][root["task_id"]] = root
            for index in range(60):
                task_id = "CYRUS-LINEAGE-CAP-" + str(index).zfill(3)
                server.runtime["tasks"][task_id] = {
                    "task_id": task_id,
                    "objective": "Bound retry history",
                    "mode": "autonomous",
                    "status": "FAILED",
                    "parent_task_id": root["task_id"],
                    "retry_number": 1,
                    "created_at": "2026-10-20T10:01:00Z",
                }
        with patch.object(server, "load_history", return_value=[]):
            response = self.client.get("/api/tasks/CYRUS-LINEAGE-CAP-ROOT/lineage")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["attempt_count"], 50)
        self.assertTrue(payload["truncated"])
        self.assertEqual(payload["root_task_id"], root["task_id"])
        self.assertEqual(len({item["task_id"] for item in payload["attempts"]}), 50)

    def test_retry_rejects_non_terminal_tasks(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-STILL-RUNNING"] = {
                "task_id": "CYRUS-STILL-RUNNING",
                "objective": "Do not fork active work",
                "mode": "autonomous",
                "status": "RUNNING",
                "retry_number": 0,
            }
        response = self.client.post(
            "/api/tasks/CYRUS-STILL-RUNNING/retry",
            headers={"Idempotency-Key": "retry-running-001"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["status"], "RUNNING")

    def test_retry_enforces_configured_lineage_limit(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-RETRY-EXHAUSTED"] = {
                "task_id": "CYRUS-RETRY-EXHAUSTED",
                "objective": "Stop after the configured retry budget",
                "mode": "autonomous",
                "status": "FAILED",
                "retry_number": server.MAX_TASK_RETRIES,
            }
        response = self.client.post(
            "/api/tasks/CYRUS-RETRY-EXHAUSTED/retry",
            headers={"Idempotency-Key": "retry-exhausted-001"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["max_task_retries"], server.MAX_TASK_RETRIES)

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

    def test_github_pages_origin_receives_api_cors_headers(self):
        response = self.client.get(
            "/api/health",
            headers={"Origin": "https://mahitech580.github.io"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "https://mahitech580.github.io")
        self.assertIn("GET", response.headers.get("Access-Control-Allow-Methods", ""))
        self.assertIn("POST", response.headers.get("Access-Control-Allow-Methods", ""))
        self.assertIn("Origin", response.headers.get("Vary", ""))

    def test_api_preflight_accepts_execution_and_sse_headers(self):
        response = self.client.options(
            "/api/execute",
            headers={
                "Origin": "https://mahitech580.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key,x-cyrus-access-key",
            },
        )
        self.assertIn(response.status_code, (200, 204))
        self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "https://mahitech580.github.io")
        allowed_headers = response.headers.get("Access-Control-Allow-Headers", "").lower()
        self.assertIn("content-type", allowed_headers)
        self.assertIn("idempotency-key", allowed_headers)
        self.assertIn("last-event-id", allowed_headers)
        self.assertIn("x-cyrus-access-key", allowed_headers)

    def test_disallowed_origin_does_not_receive_cors_grant(self):
        response = self.client.get(
            "/api/health",
            headers={"Origin": "https://malicious.example"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_provider_capabilities_are_explicit_and_do_not_expose_secrets(self):
        response = self.client.get("/api/provider")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["provider"], server.PROVIDER.name)
        self.assertEqual(payload["model_available"], server.PROVIDER.mode == "LIVE")
        self.assertFalse(payload["supports_external_search"])
        self.assertFalse(payload["supports_code_execution"])
        self.assertNotIn("api_key", payload)
        self.assertNotIn("authorization", str(payload).lower())

    def test_security_endpoint_reports_configuration_without_returning_secret(self):
        with patch.object(server, "API_ACCESS_KEY", "should-not-be-returned"):
            response = self.client.get("/api/security")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["api_access_key_required"])
        self.assertNotIn("should-not-be-returned", str(payload))

    def test_live_provider_without_access_key_fails_closed(self):
        from types import SimpleNamespace
        with patch.object(server, "PROVIDER", SimpleNamespace(mode="LIVE", name="test-live", status="ready")), patch.object(server, "API_ACCESS_KEY", ""):
            health = self.client.get("/api/health")
            ready = self.client.get("/api/ready")
            security = self.client.get("/api/security")
            provider = self.client.get("/api/provider")
            private = self.client.get("/api/metrics")
            execute = self.client.post("/api/execute", json={"prompt": "Do not allow anonymous paid model use"})
        self.assertEqual(health.status_code, 200)
        self.assertFalse(health.get_json()["ready"])
        self.assertTrue(health.get_json()["live_model_locked"])
        self.assertEqual(ready.status_code, 503)
        self.assertEqual(ready.get_json()["reason"], "live_model_requires_api_access_key")
        self.assertIn("locked", provider.get_json()["message"].lower())
        self.assertTrue(security.get_json()["api_access_key_required"])
        self.assertFalse(security.get_json()["api_access_key_configured"])
        self.assertTrue(security.get_json()["live_model_locked"])
        self.assertEqual(private.status_code, 503)
        self.assertEqual(execute.status_code, 503)
        self.assertTrue(private.get_json()["access_key_required"])

    def test_api_access_key_gates_private_routes_but_keeps_health_public(self):
        with patch.object(server, "API_ACCESS_KEY", "unit-test-access-key"):
            health = self.client.get("/api/health")
            denied = self.client.get("/api/tasks")
            allowed = self.client.get(
                "/api/tasks",
                headers={"X-CYRUS-Access-Key": "unit-test-access-key"},
            )
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.get_json()["api_access_key_required"])
        self.assertEqual(denied.status_code, 401)
        self.assertTrue(denied.get_json()["access_key_required"])
        self.assertEqual(allowed.status_code, 200)

    def test_api_access_key_compare_is_required_for_task_streams(self):
        with patch.object(server, "API_ACCESS_KEY", "stream-key"):
            denied = self.client.get("/api/tasks/CYRUS-MISSING/stream")
            allowed_missing = self.client.get(
                "/api/tasks/CYRUS-MISSING/stream",
                headers={"X-CYRUS-Access-Key": "stream-key"},
            )
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(allowed_missing.status_code, 404)

    def test_health_contract(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertIn("system", payload)
        self.assertIn("mode", payload)
        self.assertIn("ready", payload)
        self.assertIn("capacity_utilization", payload)
        self.assertIn("release", payload)
        self.assertIn("started_at", payload)

    def test_backend_serves_every_browser_asset_but_not_private_python_files(self):
        for path in ("/styles.css", "/app.js", "/demo-bridge.js", "/runtime-config.js", "/event-stream.js", "/task-export.js"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertGreater(len(response.data), 0)
        private_python = self.client.get("/server.py")
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
        self.assertEqual(response.headers["Cross-Origin-Opener-Policy"], "same-origin")
        self.assertEqual(response.headers["Cross-Origin-Resource-Policy"], "same-origin")
        self.assertEqual(response.headers["X-Permitted-Cross-Domain-Policies"], "none")
        self.assertEqual(response.headers["X-DNS-Prefetch-Control"], "off")
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

    def test_execute_rejects_non_object_json_payloads(self):
        for body in ("[]", "[1]", '"prompt"', "123", "false", "null"):
            with self.subTest(body=body):
                response = self.client.post(
                    "/api/execute",
                    data=body,
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["error"], "JSON body must be an object")

        with server.runtime["lock"]:
            self.assertEqual(server.runtime["tasks"], {})

    def test_execute_rejects_non_string_prompt_and_mode(self):
        cases = (
            ({"prompt": 123}, "Prompt must be a string"),
            ({"prompt": None}, "Prompt must be a string"),
            ({"prompt": []}, "Prompt must be a string"),
            ({"prompt": "Build a service", "mode": 123}, "Mode must be a string"),
            ({"prompt": "Build a service", "mode": None}, "Mode must be a string"),
            ({"prompt": "Build a service", "mode": []}, "Mode must be a string"),
            ({"prompt": "Build a service", "mode": "manual"}, "Mode must be autonomous or supervised"),
        )
        for payload, expected_error in cases:
            with self.subTest(payload=payload):
                response = self.client.post("/api/execute", json=payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["error"], expected_error)

        # Invalid submissions must not burn the caller's execution quota.
        with server.runtime["lock"]:
            self.assertEqual(server.runtime["rate_limits"], {})

    def test_execute_rejects_malformed_json(self):
        response = self.client.post(
            "/api/execute",
            data='{"prompt":',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_metrics_include_persisted_outcomes_after_runtime_restart(self):
        records = [
            {"task_id": "CYRUS-HIST-DONE", "created_at": "2026-10-01T10:00:00Z", "status": "COMPLETED", "execution_time_ms": 1200},
            {"task_id": "CYRUS-HIST-FAIL", "created_at": "2026-10-02T10:00:00Z", "status": "FAILED", "execution_time_ms": 300},
        ]
        with patch("server.load_history", return_value=records):
            payload = self.client.get("/api/metrics").get_json()
        self.assertEqual(payload["total_tasks"], 2)
        self.assertEqual(payload["completed_tasks"], 1)
        self.assertEqual(payload["failed_tasks"], 1)
        self.assertEqual(payload["average_execution_ms"], 750.0)

    def test_history_migration_merges_legacy_rows_when_database_is_not_empty(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "history.json"
            target.write_text(
                '[{"task_id":"CYRUS-LEGACY","created_at":"2026-09-01T00:00:00Z","status":"COMPLETED"},'
                '{"task_id":"CYRUS-DUPLICATE","created_at":"2026-09-02T00:00:00Z","status":"FAILED","summary":"old"}]',
                encoding="utf-8",
            )
            store = HistoryStore(target.with_suffix(".sqlite3"))
            store.save_all([{
                "task_id": "CYRUS-DUPLICATE",
                "created_at": "2026-09-02T00:00:00Z",
                "status": "COMPLETED",
                "summary": "database version wins",
            }])
            with patch.object(server, "STORE", target), patch.object(server, "HISTORY_STORE", store), patch.object(server, "_legacy_migration_attempted", False):
                records = server.load_history()
            by_id = {item["task_id"]: item for item in records}
            self.assertIn("CYRUS-LEGACY", by_id)
            self.assertEqual(by_id["CYRUS-DUPLICATE"]["summary"], "database version wins")

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
        self.assertIn("queued_tasks", payload)
        self.assertIn("release", payload)

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
        with patch.object(server, "persist_task"):
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
            server.runtime["tasks"]["CYRUS-CANCEL"] = {"task_id": "CYRUS-CANCEL", "status": "RUNNING"}
            server.runtime["cancel_events"]["CYRUS-CANCEL"] = cancel_event
        with patch.object(server, "persist_task"):
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

    def test_task_event_stream_emits_state_trace_and_terminal_close(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-STREAM"] = {
                "task_id": "CYRUS-STREAM",
                "status": "COMPLETED",
                "current_agent": "RELEASE",
                "updated_at": server.now_iso(),
                "score": 94,
                "confidence": 96,
                "quality": 94,
                "coverage": 92,
                "risk": "LOW",
                "tool_calls": 7,
                "events": [
                    {
                        "event_id": "CYRUS-STREAM-E001",
                        "agent": "ORCHESTRATOR",
                        "phase": "INITIALIZATION",
                        "message": "Execution context established",
                        "duration": 10,
                    }
                ],
            }
        response = self.client.get(
            "/api/tasks/CYRUS-STREAM/stream",
            headers={"Accept": "text/event-stream"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/event-stream")
        body = response.get_data(as_text=True)
        self.assertIn("event: state", body)
        self.assertIn("event: trace", body)
        self.assertIn("id: CYRUS-STREAM-E001", body)
        self.assertIn('"status":"COMPLETED"', body)
        self.assertEqual(response.headers["Cache-Control"], "no-cache, no-transform")

    def test_task_event_stream_ignores_cursor_from_another_task(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-STREAM-TARGET"] = {
                "task_id": "CYRUS-STREAM-TARGET",
                "status": "COMPLETED",
                "current_agent": "RELEASE",
                "updated_at": server.now_iso(),
                "events": [
                    {"event_id": "CYRUS-STREAM-TARGET-E001", "agent": "PLANNER"},
                    {"event_id": "CYRUS-STREAM-TARGET-E002", "agent": "RELEASE"},
                ],
            }
        response = self.client.get(
            "/api/tasks/CYRUS-STREAM-TARGET/stream",
            headers={"Last-Event-ID": "CYRUS-ANOTHER-TASK-E999"},
        )
        body = response.get_data(as_text=True)
        self.assertIn("CYRUS-STREAM-TARGET-E001", body)
        self.assertIn("CYRUS-STREAM-TARGET-E002", body)

    def test_task_event_stream_replays_when_cursor_sequence_is_oversized(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-LONG-CURSOR"] = {
                "task_id": "CYRUS-LONG-CURSOR",
                "status": "COMPLETED",
                "current_agent": "RELEASE",
                "updated_at": server.now_iso(),
                "events": [
                    {"event_id": "CYRUS-LONG-CURSOR-E001", "agent": "PLANNER"},
                ],
            }
        response = self.client.get(
            "/api/tasks/CYRUS-LONG-CURSOR/stream",
            headers={"Last-Event-ID": "CYRUS-LONG-CURSOR-E" + ("9" * 5000)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("CYRUS-LONG-CURSOR-E001", response.get_data(as_text=True))

    def test_task_event_stream_resumes_after_last_event_id(self):
        with server.runtime["lock"]:
            server.runtime["tasks"]["CYRUS-RESUME"] = {
                "task_id": "CYRUS-RESUME",
                "status": "COMPLETED",
                "current_agent": "RELEASE",
                "updated_at": server.now_iso(),
                "events": [
                    {"event_id": "CYRUS-RESUME-E001", "agent": "A"},
                    {"event_id": "CYRUS-RESUME-E002", "agent": "B"},
                ],
            }
        response = self.client.get(
            "/api/tasks/CYRUS-RESUME/stream",
            headers={"Last-Event-ID": "CYRUS-RESUME-E001"},
        )
        body = response.get_data(as_text=True)
        self.assertNotIn("CYRUS-RESUME-E001", body)
        self.assertIn("CYRUS-RESUME-E002", body)
        self.assertIn("event: close", body)

    def test_unknown_route_preserves_http_404(self):
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.get_json()["error"].lower())

    def test_method_not_allowed_preserves_http_405(self):
        response = self.client.put("/api/health")
        self.assertEqual(response.status_code, 405)
        self.assertIn("method", response.get_json()["error"].lower())

    def test_legacy_history_detail_receives_current_retry_defaults_without_mutation(self):
        legacy = {
            "task_id": "CYRUS-LEGACY-FAILED",
            "objective": "Retry legacy persisted work",
            "mode": "autonomous",
            "status": "FAILED",
        }
        with patch.object(server, "load_history", return_value=[legacy]), patch.object(
            server, "MAX_TASK_RETRIES", 0
        ):
            response = self.client.get("/api/tasks/CYRUS-LEGACY-FAILED")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["retry_number"], 0)
        self.assertIsNone(payload["retry_reason"])
        self.assertEqual(payload["max_task_retries"], 0)
        self.assertEqual(payload["effective_max_task_retries"], 0)
        self.assertNotIn("retry_number", legacy)
        self.assertNotIn("max_task_retries", legacy)

    def test_missing_task_is_explicit(self):
        response = self.client.get("/api/tasks/CYRUS-MISSING")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Task not found")


    def test_runtime_execution_emits_progress_and_never_fakes_test_results(self):
        task = {
            "task_id": "CYRUS-REALTIME-TEST",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            "objective": "Build a service with meaningful validation",
            "mode": "autonomous",
            "status": "RUNNING",
            "current_agent": "ORCHESTRATOR",
            "plan": [],
            "research": [],
            "implementation": "",
            "validation_plan": [],
            "review": {},
            "tool_calls": 0,
            "artifacts": [],
            "tests_passed": 0,
            "tests_failed": 0,
            "coverage": 0,
            "quality": 0,
            "risk": "UNKNOWN",
            "confidence": 0,
            "score": 0,
            "latency_ms": 0,
            "execution_time_ms": 0,
            "summary": "",
            "idempotency_key": None,
            "events": [],
            "agents": [dict(agent, status="QUEUED") for agent in server.AGENTS],
        }
        with patch.object(server, "PROVIDER", DeterministicProvider()):
            with patch.object(server, "persist_task"):
                server._run_task(task)
        self.assertEqual(task["status"], "COMPLETED")
        self.assertEqual(task["tests_passed"], 0)
        self.assertEqual(task["tests_failed"], 0)
        self.assertEqual(task["coverage"], 0)
        self.assertEqual(task["verification_status"], "STATIC_ANALYSIS_EXECUTED;PROPOSED_TESTS_NOT_EXECUTED")
        self.assertGreater(task["static_analysis"]["checks_passed"], 0)
        self.assertFalse(task["static_analysis"]["code_executed"])
        phases = [item["phase"] for item in task["events"]]
        self.assertIn("DECOMPOSITION_STARTED", phases)
        self.assertIn("DECOMPOSITION_COMPLETED", phases)
        self.assertTrue(any(item["agent"] == "PLANNER" for item in task["events"]))
        self.assertIn("EXECUTION_COMPLETED", phases)
        self.assertEqual(len(task["artifacts"]), 4)
        self.assertEqual(task["artifacts"][-1]["name"], "static-analysis.json")
        self.assertIn("deterministic demo", task["summary"].lower())
        self.assertTrue(task["artifacts"][0]["content"])

if __name__ == "__main__":
    unittest.main()
