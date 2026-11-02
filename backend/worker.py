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


def worker_retry_delay(failures: int, base_seconds: float) -> float:
    """Return bounded exponential backoff for transient worker infrastructure failures."""
    try:
        count = int(failures)
    except (TypeError, ValueError, OverflowError):
        count = 1
    try:
        base = float(base_seconds)
    except (TypeError, ValueError, OverflowError):
        base = 2.0
    if not (base == base and abs(base) != float("inf")):
        base = 2.0
    base = max(0.5, min(base, 30.0))
    exponent = max(0, min(count - 1, 5))
    return min(base * (2 ** exponent), 30.0)


def initialize_worker(stop: threading.Event, identity: str, retry_base_seconds: float) -> bool:
    """Wait for schema and heartbeat storage to recover instead of crash-looping on startup."""
    failures = 0
    while not stop.is_set():
        try:
            main.ensure_schema()
            main.touch_worker_heartbeat(identity)
            return True
        except Exception as exc:
            failures += 1
            delay = worker_retry_delay(failures, retry_base_seconds)
            logger.warning(
                "worker initialization retry exception_type=%s retry_in_seconds=%.1f",
                type(exc).__name__,
                delay,
            )
            if stop.wait(delay):
                return False
    return False


def run_worker(*, stop_event: threading.Event | None = None, worker_id: str | None = None) -> None:
    """Poll the durable queue with bounded recovery from transient database failures."""
    if not main.external_worker_required():
        raise RuntimeError("Set CYRUS_EXTERNAL_WORKER=true before starting the external worker.")

    stop = stop_event or threading.Event()
    identity = worker_id or worker_identity()
    poll_seconds = main.bounded_float_setting("CYRUS_WORKER_POLL_SECONDS", 2.0, 0.5, 30.0)
    heartbeat_seconds = main.bounded_float_setting("CYRUS_WORKER_HEARTBEAT_SECONDS", 15.0, 5.0, 60.0)
    recovery_seconds = main.bounded_float_setting("CYRUS_WORKER_RECOVERY_SECONDS", 30.0, 5.0, 120.0)
    if not initialize_worker(stop, identity, poll_seconds):
        return

    active = {"run_id": None}

    def heartbeat_loop() -> None:
        while not stop.is_set():
            try:
                main.touch_worker_heartbeat(identity, active["run_id"])
            except Exception as exc:
                logger.warning("worker heartbeat failed exception_type=%s", type(exc).__name__)
            stop.wait(heartbeat_seconds)

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
    consecutive_failures = 0
    try:
        while not stop.is_set():
            try:
                now = time.monotonic()
                if now - last_recovery >= recovery_seconds:
                    recovered = main.recover_stale_runs()
                    pruned = main.prune_stale_worker_heartbeats()
                    if recovered or pruned:
                        logger.info(
                            "worker maintenance recovered_workflows=%s pruned_heartbeats=%s",
                            recovered,
                            pruned,
                        )
                    last_recovery = now

                run_id = next_queued_run_id()
                if run_id is None:
                    consecutive_failures = 0
                    stop.wait(poll_seconds)
                    continue

                active["run_id"] = run_id
                try:
                    main.touch_worker_heartbeat(identity, run_id)
                    logger.info("workflow dispatch worker_id=%s run_id=%s", identity, run_id)
                    started_at = time.perf_counter()
                    claimed = main.execute_workflow(run_id, should_stop=stop.is_set)
                    duration_ms = (time.perf_counter() - started_at) * 1000
                    logger.info(
                        "workflow dispatch returned worker_id=%s run_id=%s claimed=%s duration_ms=%.1f",
                        identity,
                        run_id,
                        claimed,
                        duration_ms,
                    )
                    consecutive_failures = 0
                finally:
                    active["run_id"] = None
                    try:
                        main.touch_worker_heartbeat(identity)
                    except Exception as exc:
                        # A transient heartbeat write must not terminate queue consumption.
                        logger.warning("worker heartbeat refresh failed exception_type=%s", type(exc).__name__)
            except Exception as exc:
                consecutive_failures += 1
                delay = worker_retry_delay(consecutive_failures, poll_seconds)
                logger.warning(
                    "worker loop retry exception_type=%s failures=%s retry_in_seconds=%.1f",
                    type(exc).__name__,
                    consecutive_failures,
                    delay,
                )
                stop.wait(delay)
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
