import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from storage import HistoryStore


class HistoryStoreTests(unittest.TestCase):
    def test_sqlite_history_round_trip_and_update(self):
        with TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "history.sqlite3")
            with patch.dict(os.environ, {
                "CYRUS_DATABASE_URL": "",
                "DATABASE_URL": "",
                "CYRUS_DATABASE_PATH": db_path,
            }):
                store = HistoryStore(Path(tmp) / "fallback.sqlite3")
                store.save_all([{
                    "task_id": "CYRUS-TEST0001",
                    "created_at": "2026-10-01T10:00:00Z",
                    "updated_at": "2026-10-01T10:00:00Z",
                    "status": "RUNNING",
                    "objective": "initial objective",
                }])
                store.save_all([{
                    "task_id": "CYRUS-TEST0001",
                    "created_at": "2026-10-01T10:00:00Z",
                    "updated_at": "2026-10-01T10:02:00Z",
                    "status": "COMPLETED",
                    "objective": "initial objective",
                    "summary": "finished",
                }])
                result = store.load_all()
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]["status"], "COMPLETED")
                self.assertEqual(result[0]["summary"], "finished")
                self.assertEqual(store.info()["backend"], "sqlite")

    def test_connectivity_check_reports_success_without_leaking_details(self):
        with TemporaryDirectory() as directory:
            store = HistoryStore(Path(directory) / "history.sqlite3")
            result = store.check()
        self.assertEqual(result, {
            "reachable": True,
            "backend": "sqlite",
            "error_type": None,
        })

    def test_connectivity_check_reports_only_exception_type_on_failure(self):
        with TemporaryDirectory() as directory:
            store = HistoryStore(Path(directory) / "history.sqlite3")
            with patch.object(store, "_connect", side_effect=RuntimeError("postgres://user:secret@db.internal")):
                result = store.check()
        self.assertEqual(result["reachable"], False)
        self.assertEqual(result["backend"], "sqlite")
        self.assertEqual(result["error_type"], "RuntimeError")
        self.assertNotIn("secret", str(result))
        self.assertNotIn("db.internal", str(result))

    def test_connectivity_check_detects_missing_history_schema(self):
        with TemporaryDirectory() as directory:
            store = HistoryStore(Path(directory) / "history.sqlite3")
            conn = store._connect()
            try:
                store._execute(conn, "DROP TABLE cyrus_execution_history")
                conn.commit()
            finally:
                conn.close()
            result = store.check()

        self.assertFalse(result["reachable"])
        self.assertEqual(result["backend"], "sqlite")
        self.assertIn(result["error_type"], {"OperationalError", "ProgrammingError"})

    def test_unsupported_database_url_fails_loudly(self):
        with patch.dict(os.environ, {
            "CYRUS_DATABASE_URL": "mysql://user:secret@example.test/cyrus",
            "DATABASE_URL": "",
        }):
            with self.assertRaisesRegex(ValueError, "must be a PostgreSQL connection string"):
                HistoryStore("unused.sqlite3")

    def test_sqlalchemy_psycopg_postgres_scheme_is_normalized(self):
        with TemporaryDirectory() as tmp:
            # Normalize before attempting a connection; an unreachable URL fails after normalization.
            with patch.dict(os.environ, {
                "CYRUS_DATABASE_URL": "postgresql+psycopg://user:pass@127.0.0.1:1/cyrus",
                "DATABASE_URL": "",
            }):
                from unittest.mock import patch as mock_patch
                with mock_patch.object(HistoryStore, "_initialize", lambda self: None):
                    store = HistoryStore(Path(tmp) / "unused.sqlite3")
                self.assertEqual(store.backend, "postgresql")
                self.assertTrue(store.database_url.startswith("postgresql://"))

    def test_history_is_bounded_to_latest_one_hundred_records(self):
        with TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "history.sqlite3")
            with patch.dict(os.environ, {
                "CYRUS_DATABASE_URL": "",
                "DATABASE_URL": "",
                "CYRUS_DATABASE_PATH": db_path,
            }):
                store = HistoryStore(Path(tmp) / "fallback.sqlite3")
                records = [{
                    "task_id": f"CYRUS-{index:08d}",
                    "created_at": f"2026-10-{(index % 28) + 1:02d}T10:00:{index % 60:02d}Z",
                    "updated_at": f"2026-10-{(index % 28) + 1:02d}T10:00:{index % 60:02d}Z",
                    "status": "COMPLETED",
                } for index in range(120)]
                store.save_all(records)
                saved = store.load_all()
                self.assertEqual(len(saved), 100)
                self.assertEqual({item["task_id"] for item in saved}, {item["task_id"] for item in records[-100:]})


if __name__ == "__main__":
    unittest.main()
