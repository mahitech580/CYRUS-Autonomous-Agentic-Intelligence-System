"""Bounded in-memory rate-limit bookkeeping tests."""
import time
import unittest
from collections import deque
from unittest.mock import patch

import server


class RateLimitBoundsTests(unittest.TestCase):
    def setUp(self):
        with server.runtime["lock"]:
            self.previous = server.runtime["rate_limits"]
            server.runtime["rate_limits"] = {}

    def tearDown(self):
        with server.runtime["lock"]:
            server.runtime["rate_limits"] = self.previous

    def test_address_churn_never_exceeds_hard_key_limit(self):
        allowed = 0
        for index in range(server.MAX_RATE_LIMIT_KEYS + 1):
            ok, _ = server.rate_limit_execution("synthetic-client-" + str(index))
            allowed += int(ok)
        self.assertEqual(allowed, server.MAX_RATE_LIMIT_KEYS)
        self.assertEqual(len(server.runtime["rate_limits"]), server.MAX_RATE_LIMIT_KEYS)

    def test_new_client_is_rejected_when_all_slots_are_active(self):
        now = time.monotonic()
        with server.runtime["lock"]:
            server.runtime["rate_limits"] = {
                "existing-" + str(index): deque([now])
                for index in range(server.MAX_RATE_LIMIT_KEYS)
            }
        allowed, retry_after = server.rate_limit_execution("new-client")
        self.assertFalse(allowed)
        self.assertEqual(retry_after, 60)
        self.assertEqual(len(server.runtime["rate_limits"]), server.MAX_RATE_LIMIT_KEYS)
        self.assertNotIn("new-client", server.runtime["rate_limits"])

    def test_expired_client_entries_are_removed_before_admission(self):
        old = time.monotonic() - 61
        with server.runtime["lock"]:
            server.runtime["rate_limits"] = {
                "expired-" + str(index): deque([old])
                for index in range(server.MAX_RATE_LIMIT_KEYS)
            }
        allowed, retry_after = server.rate_limit_execution("fresh-client")
        self.assertTrue(allowed)
        self.assertEqual(retry_after, 0)
        self.assertEqual(list(server.runtime["rate_limits"]), ["fresh-client"])

    def test_existing_client_is_not_blocked_by_full_key_map(self):
        now = time.monotonic()
        with server.runtime["lock"]:
            server.runtime["rate_limits"] = {
                "existing-" + str(index): deque([now])
                for index in range(server.MAX_RATE_LIMIT_KEYS)
            }
        with patch.object(server, "MAX_EXECUTIONS_PER_MINUTE", 2):
            allowed, retry_after = server.rate_limit_execution("existing-0")
        self.assertTrue(allowed)
        self.assertEqual(retry_after, 0)
        self.assertEqual(len(server.runtime["rate_limits"]), server.MAX_RATE_LIMIT_KEYS)

    def test_per_client_window_still_enforces_limit(self):
        with patch.object(server, "MAX_EXECUTIONS_PER_MINUTE", 2):
            self.assertEqual(server.rate_limit_execution("limited-client"), (True, 0))
            self.assertEqual(server.rate_limit_execution("limited-client"), (True, 0))
            allowed, retry_after = server.rate_limit_execution("limited-client")
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 1)

    def test_missing_remote_address_uses_fallback_bucket(self):
        self.assertEqual(server.rate_limit_execution(None), (True, 0))
        self.assertIn("unknown", server.runtime["rate_limits"])


if __name__ == "__main__":
    unittest.main()
