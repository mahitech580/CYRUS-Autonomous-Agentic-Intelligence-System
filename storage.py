"""Small database-backed execution history store.

PostgreSQL is selected when CYRUS_DATABASE_URL or DATABASE_URL is configured.
SQLite is the zero-configuration local fallback. Payloads remain JSON documents so
the execution schema can evolve without destructive migrations.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


TABLE = "cyrus_execution_history"
MAX_HISTORY = 100


class HistoryStore:
    def __init__(self, sqlite_path: str | Path):
        raw_url = (os.getenv("CYRUS_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
        if raw_url.startswith("postgres://"):
            raw_url = "postgresql://" + raw_url[len("postgres://"):]
        elif raw_url.startswith("postgresql+psycopg://"):
            raw_url = "postgresql://" + raw_url[len("postgresql+psycopg://"):]
        if raw_url and not raw_url.startswith("postgresql://"):
            raise ValueError(
                "CYRUS_DATABASE_URL/DATABASE_URL must be a PostgreSQL connection string; "
                "use CYRUS_DATABASE_PATH to configure the SQLite fallback."
            )
        self.database_url = raw_url
        self.backend = "postgresql" if self.database_url else "sqlite"
        self.sqlite_path = Path(os.getenv("CYRUS_DATABASE_PATH", str(sqlite_path))).expanduser()
        if self.backend == "sqlite":
            self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self):
        if self.backend == "postgresql":
            try:
                import psycopg
            except ImportError as exc:
                raise RuntimeError(
                    "PostgreSQL is configured but psycopg is not installed. Install requirements.txt."
                ) from exc
            return psycopg.connect(self.database_url, connect_timeout=5)
        conn = sqlite3.connect(str(self.sqlite_path), timeout=10)
        conn.execute("PRAGMA busy_timeout = 10000")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _execute(self, conn, sql: str, params=()):
        if self.backend == "postgresql":
            cursor = conn.cursor()
            cursor.execute(sql.replace("?", "%s"), params)
            return cursor
        return conn.execute(sql, params)

    def _initialize(self):
        conn = self._connect()
        try:
            self._execute(conn, f"""
                CREATE TABLE IF NOT EXISTS {TABLE} (
                    task_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    idempotency_key TEXT,
                    payload TEXT NOT NULL
                )
            """)
            self._execute(
                conn,
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_created ON {TABLE}(created_at)",
            )
            self._execute(
                conn,
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE}_idempotency ON {TABLE}(idempotency_key)",
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def load_all(self) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            rows = self._execute(
                conn,
                f"SELECT payload FROM {TABLE} ORDER BY created_at ASC, task_id ASC",
            ).fetchall()
            result = []
            for row in rows:
                try:
                    item = json.loads(row[0])
                except (TypeError, json.JSONDecodeError):
                    continue
                if isinstance(item, dict) and item.get("task_id"):
                    result.append(item)
            return result
        finally:
            conn.close()

    def save_all(self, items: list[dict[str, Any]]) -> None:
        kept = [item for item in items[-MAX_HISTORY:] if isinstance(item, dict) and item.get("task_id")]
        conn = self._connect()
        try:
            existing_rows = self._execute(
                conn, f"SELECT task_id, payload FROM {TABLE}"
            ).fetchall()
            existing = {row[0]: row[1] for row in existing_rows}
            desired_ids = set()

            for item in kept:
                task_id = str(item["task_id"])
                desired_ids.add(task_id)
                payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
                if existing.get(task_id) == payload:
                    continue
                self._execute(
                    conn,
                    f"""
                    INSERT INTO {TABLE}
                        (task_id, created_at, updated_at, status, idempotency_key, payload)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(task_id) DO UPDATE SET
                        created_at = excluded.created_at,
                        updated_at = excluded.updated_at,
                        status = excluded.status,
                        idempotency_key = excluded.idempotency_key,
                        payload = excluded.payload
                    """,
                    (
                        task_id,
                        str(item.get("created_at") or ""),
                        str(item.get("updated_at") or item.get("created_at") or ""),
                        str(item.get("status") or "UNKNOWN"),
                        item.get("idempotency_key"),
                        payload,
                    ),
                )

            for old_id in existing:
                if old_id not in desired_ids:
                    self._execute(conn, f"DELETE FROM {TABLE} WHERE task_id = ?", (old_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def info(self) -> dict[str, Any]:
        hosted_ephemeral = bool(os.getenv("RENDER")) and self.backend == "sqlite"
        if self.backend == "postgresql":
            note = "PostgreSQL history store configured."
        elif hosted_ephemeral:
            note = "SQLite is active on an ephemeral host; history may be lost after restart or redeploy. Configure CYRUS_DATABASE_URL for durable hosted history."
        else:
            note = "SQLite file history store active. Set CYRUS_DATABASE_PATH to choose a different location."
        return {
            "backend": self.backend,
            "configured": self.backend == "postgresql" or bool(os.getenv("CYRUS_DATABASE_PATH")),
            "durability": "managed_database" if self.backend == "postgresql" else ("ephemeral_host_filesystem" if hosted_ephemeral else "local_file"),
            "history_limit": MAX_HISTORY,
            "note": note,
        }
