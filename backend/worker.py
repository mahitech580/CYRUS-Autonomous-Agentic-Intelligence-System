"""Long-running database-backed worker for durable CYRUS workflow execution.

Run with: python -m backend.worker
The API and worker share DATABASE_URL; provider credentials remain server-side.
"""
from __future__ import annotations

import logging
import os
import re
import signal
import socket
import threading
import time

from sqlalchemy import select

try:
    from . import main
except ImportError:  # Support direct execution from the backend directory.
    import main


logger = logging.getLogger("cyrus.worker")


def worker_identity() -> str:
    """Build a safe per-process lease ID even when replicas share a configured prefix."""
    configured = os.getenv("CYRUS_WORKER_ID", "").strip()
    prefix = re.sub(r"[^A-Za-z0-9._:-]", "-", configured or "cyrus-worker")[:20]
    host = re.sub(r"[^A-Za-z0-9._:-]", "-", socket.gethostname())[:24] or "host"
    return f"{prefix or 'cyrus-worker'}-{host}-{os.getpid()}"[:64]


def next_queued_run_id() -> str | None:
    """Return the oldest queued workflow; execute_workflow performs the atomic claim."""
    with main.SessionLocal() as db:
        return db.scalar(
            select(main.WorkflowRun.id)
            .where(main.WorkflowRun.status == "queued")
            .order_by(main.WorkflowRun.created_at.asc(), main.WorkflowRun.id.asc())
            .limit(1)
        )


def run_once() -> str | None:
    """Recover expired leases and process at most one queued workflow."""
    main.recover_stale_runs()
    run_id = next_queued_run_id()
    if run_id is None:
        return None
    return run_id if main.execute_workflow(run_id) else None


def run_worker(*, stop_event: threading.Event | None = None, worker_id: str | None = None) -> None:
    """Poll the durable database queue while a separate thread refreshes the lease."""
    if not main.external_worker_required():
        raise RuntimeError("Set CYRUS_EXTERNAL_WORKER=true before starting the external worker.")

    main.ensure_schema()
    stop = stop_event or threading.Event()
    identity = worker_id or worker_identity()
    poll_seconds = main.bounded_float_setting("CYRUS_WORKER_POLL_SECONDS", 2.0, 0.5, 30.0)
    heartbeat_seconds = main.bounded_float_setting("CYRUS_WORKER_HEARTBEAT_SECONDS", 15.0, 5.0, 60.0)
    recovery_seconds = main.bounded_float_setting("CYRUS_WORKER_RECOVERY_SECONDS", 30.0, 5.0, 120.0)
    active = {"run_id": None}

    def heartbeat_loop() -> None:
        while not stop.is_set():
            try:
                main.touch_worker_heartbeat(identity, active["run_id"])
            except Exception as exc:
                logger.warning("worker heartbeat failed exception_type=%s", type(exc).__name__)
            stop.wait(heartbeat_seconds)

    main.touch_worker_heartbeat(identity)
    heartbeat = threading.Thread(target=heartbeat_loop, name="cyrus-worker-heartbeat", daemon=True)
    heartbeat.start()
    logger.info(
        "worker started worker_id=%s poll_seconds=%.1f heartbeat_seconds=%.1f recovery_seconds=%.1f",
        identity,
        poll_seconds,
        heartbeat_seconds,
        recovery_seconds,
    )
    last_recovery = 0.0
    try:
        while not stop.is_set():
            now = time.monotonic()
            if now - last_recovery >= recovery_seconds:
                main.recover_stale_runs()
                last_recovery = now

            run_id = next_queued_run_id()
            if run_id is None:
                stop.wait(poll_seconds)
                continue

            active["run_id"] = run_id
            main.touch_worker_heartbeat(identity, run_id)
            logger.info("workflow dispatch worker_id=%s run_id=%s", identity, run_id)
            try:
                # The worker claim is a conditional UPDATE, so multiple pollers
                # may observe the same queued row but only one can execute it.
                claimed = main.execute_workflow(run_id)
                logger.info(
                    "workflow dispatch returned worker_id=%s run_id=%s claimed=%s",
                    identity,
                    run_id,
                    claimed,
                )
            finally:
                active["run_id"] = None
                main.touch_worker_heartbeat(identity)

    finally:
        stop.set()
        heartbeat.join(timeout=heartbeat_seconds + 1)
        try:
            main.remove_worker_heartbeat(identity)
        except Exception as exc:
            logger.warning("worker heartbeat cleanup failed exception_type=%s", type(exc).__name__)
        logger.info("worker stopped worker_id=%s", identity)


def main_entrypoint() -> None:
    stop = threading.Event()

    def request_stop(_signum, _frame) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    run_worker(stop_event=stop)


if __name__ == "__main__":
    main_entrypoint()
