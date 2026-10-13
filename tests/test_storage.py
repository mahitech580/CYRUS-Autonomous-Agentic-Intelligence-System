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
