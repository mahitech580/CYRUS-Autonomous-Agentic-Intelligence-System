from flask import Flask, g, jsonify, request, send_from_directory, Response, stream_with_context
from datetime import datetime, timezone, timedelta
import math
from concurrent.futures import ThreadPoolExecutor
from providers import get_provider
from static_analysis import analyze_draft
from storage import HistoryStore
from werkzeug.exceptions import HTTPException
from pathlib import Path
import json
import os
import hmac
import threading
import time
import uuid
import random
import re
import tempfile
from collections import deque

BASE_DIR = Path(__file__).resolve().parent
STORE = Path(os.getenv("CYRUS_HISTORY_PATH", str(BASE_DIR / "cyrus_history.json"))).expanduser()
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("CYRUS_MAX_REQUEST_BYTES", "16384"))
MAX_PROMPT_CHARS = max(200, min(int(os.getenv("CYRUS_MAX_PROMPT_CHARS", "4000")), 20000))
RELEASE_ID = os.getenv("CYRUS_RELEASE", "local")[:80]
API_ACCESS_KEY = os.getenv("CYRUS_API_ACCESS_KEY", "").strip()
PUBLIC_API_GET_PATHS = {"/api/health", "/api/ready", "/api/provider", "/api/security"}
MAX_TASK_RUNTIME_SECONDS = max(30, min(int(os.getenv("CYRUS_TASK_TIMEOUT_SECONDS", "240")), 900))
try:
    MAX_TASK_RETRIES = int(os.getenv("CYRUS_MAX_TASK_RETRIES", "3"))
except ValueError:
    MAX_TASK_RETRIES = 3
MAX_TASK_RETRIES = max(0, min(MAX_TASK_RETRIES, 10))

DEFAULT_CORS_ORIGINS = {
    "https://mahitech580.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}
CORS_ALLOWED_ORIGINS = {
    item.strip().rstrip("/")
    for item in os.getenv("CYRUS_CORS_ORIGINS", ",".join(sorted(DEFAULT_CORS_ORIGINS))).split(",")
    if item.strip()
}

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

@app.before_request
def establish_request_context():
    candidate = request.headers.get("X-Request-ID", "").strip()
    g.request_id = candidate if REQUEST_ID_PATTERN.fullmatch(candidate) else uuid.uuid4().hex
    g.request_started = time.perf_counter()
    if not request.path.startswith("/api/") or request.method == "OPTIONS":
        return None
    if request.method == "GET" and request.path in PUBLIC_API_GET_PATHS:
        return None
    # Never leave a configured, billable model endpoint open to anonymous execution.
    # If an operator enables a provider key but forgets the separate API key, fail closed.
    provider_is_live = getattr(globals().get("PROVIDER"), "mode", "DEMO") == "LIVE"
    if provider_is_live and not API_ACCESS_KEY:
        return jsonify({
            "error": "Private API access is locked because a live model provider is configured without CYRUS_API_ACCESS_KEY. Set a long random key in the hosting environment before using private routes.",
            "request_id": g.request_id,
            "access_key_required": True,
            "access_key_configured": False,
            "live_model_locked": True,
        }), 503
    if API_ACCESS_KEY and not hmac.compare_digest(
        request.headers.get("X-CYRUS-Access-Key", ""), API_ACCESS_KEY
    ):
        return jsonify({
            "error": "CYRUS API access key is required or invalid. Configure it in API connection settings.",
            "request_id": g.request_id,
            "access_key_required": True,
        }), 401
    return None

@app.after_request
def apply_response_hardening(response):
    request_id = getattr(g, "request_id", uuid.uuid4().hex)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(round((time.perf_counter() - getattr(g, "request_started", time.perf_counter())) * 1000, 2))
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    origin = request.headers.get("Origin", "").strip().rstrip("/")
    if request.path.startswith("/api/") and origin and origin in CORS_ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Idempotency-Key, Last-Event-ID, X-Request-ID, X-CYRUS-Access-Key"
        response.headers["Access-Control-Expose-Headers"] = "X-Request-ID, X-Response-Time-Ms"
        response.headers["Access-Control-Max-Age"] = "600"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.vary.add("Origin")
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    response.headers["X-DNS-Prefetch-Control"] = "off"
    if request.path.startswith("/api/") and not request.path.endswith("/stream"):
        response.headers["Cache-Control"] = "no-store"
    elif request.path in {"/styles.css", "/app.js", "/demo-bridge.js", "/runtime-config.js", "/event-stream.js"}:
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    return response

AGENTS = [
    {"id": 1, "name": "ORCHESTRATOR", "role": "coordination", "type": "control", "responsibility": "Owns the execution state and routes work through the agent graph."},
    {"id": 2, "name": "PLANNER", "role": "decomposition", "type": "reasoning", "responsibility": "Breaks the objective into measurable engineering tasks and dependencies."},
    {"id": 3, "name": "RESEARCHER", "role": "evidence", "type": "research", "responsibility": "Identifies implementation constraints, patterns, risks and useful evidence."},
    {"id": 4, "name": "CODER", "role": "implementation", "type": "builder", "responsibility": "Produces an implementation plan and engineering artifacts."},
    {"id": 5, "name": "TESTER", "role": "validation", "type": "quality", "responsibility": "Runs deterministic validation checks and assesses verification coverage."},
    {"id": 6, "name": "REVIEWER", "role": "assurance", "type": "review", "responsibility": "Scores quality, identifies risk and determines release readiness."},
    {"id": 7, "name": "RELEASE", "role": "delivery", "type": "delivery", "responsibility": "Packages the result, records audit state and emits the release signal."}
]

TOOLS = [
    {"name": "Repository Scanner", "category": "analysis", "description": "Maps repositories, folders and engineering surfaces.", "route": "repo.scan"},
    {"name": "File Analyzer", "category": "analysis", "description": "Inspects source structure, file sizes and language signals.", "route": "file.inspect"},
    {"name": "Code Analyzer", "category": "quality", "description": "Evaluates maintainability, complexity and implementation shape.", "route": "code.analyze"},
    {"name": "Dependency Auditor", "category": "security", "description": "Checks dependency posture and release risk indicators.", "route": "deps.audit"},
    {"name": "Test Runner", "category": "validation", "description": "Executes deterministic checks and aggregates test statistics.", "route": "test.run"},
    {"name": "Runtime Probe", "category": "runtime", "description": "Measures latency and probes service readiness.", "route": "runtime.probe"},
    {"name": "Research Gateway", "category": "research", "description": "Provides a provider-agnostic research abstraction.", "route": "research.query"},
    {"name": "Artifact Generator", "category": "delivery", "description": "Produces manifests and implementation artifacts.", "route": "artifact.generate"}
]

MAX_CONCURRENT_TASKS = max(1, min(int(os.getenv("CYRUS_MAX_CONCURRENT_TASKS", "4")), 16))
MAX_LIVE_TASKS = max(20, min(int(os.getenv("CYRUS_MAX_LIVE_TASKS", "100")), 500))
MAX_EXECUTIONS_PER_MINUTE = max(1, min(int(os.getenv("CYRUS_EXECUTIONS_PER_MINUTE", "12")), 120))
MAX_RATE_LIMIT_KEYS = 1000
history_lock = threading.RLock()
HISTORY_STORE = HistoryStore(STORE.with_suffix(".sqlite3"))
_legacy_migration_attempted = False
PROVIDER = get_provider()

runtime = {
    "started_at": time.time(),
    "tasks": {},
    "lock": threading.Lock(),
    "executor": ThreadPoolExecutor(max_workers=MAX_CONCURRENT_TASKS),
    "futures": {},
    "idempotency": {},
    "cancel_events": {},
    "approval_events": {},
    "retry_reservations": set(),
    "rate_limits": {}
}

class CapacityError(RuntimeError):
    pass

class TaskCancelled(RuntimeError):
    pass

class TaskTimedOut(RuntimeError):
    """Raised when an execution exceeds its configured wall-clock budget."""
    pass

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def load_history():
    """Read database history and merge legacy JSON records once, preserving newer DB copies."""
    global _legacy_migration_attempted
    with history_lock:
        items = HISTORY_STORE.load_all()
        if _legacy_migration_attempted:
            return items
        _legacy_migration_attempted = True
        if not STORE.exists():
            return items
        try:
            legacy = json.loads(STORE.read_text(encoding="utf-8"))
            if not isinstance(legacy, list):
                return items
            # Preserve database versions of duplicated task IDs while importing older,
            # not-yet-migrated rows even when the database already contains new records.
            merged = {}
            for item in legacy:
                if isinstance(item, dict) and item.get("task_id"):
                    merged[str(item["task_id"])] = item
            for item in items:
                if isinstance(item, dict) and item.get("task_id"):
                    merged[str(item["task_id"])] = item
            combined = sorted(
                merged.values(),
                key=lambda item: (str(item.get("created_at") or ""), str(item.get("task_id") or "")),
            )
            HISTORY_STORE.save_all(combined[-100:])
            return HISTORY_STORE.load_all()
        except (OSError, json.JSONDecodeError, TypeError, RuntimeError):
            # Keep API health available; storage errors remain visible on routes that write.
            return items

def save_history(items):
    with history_lock:
        HISTORY_STORE.save_all(items[-100:])

def find_history_by_idempotency(key):
    if not key:
        return None
    for item in reversed(load_history()):
        if item.get("idempotency_key") == key:
            return item
    return None

def rate_limit_execution(remote_addr):
    key = remote_addr or "unknown"
    now = time.monotonic()
    window_start = now - 60
    with runtime["lock"]:
        rate_limits = runtime["rate_limits"]
        if key not in rate_limits and len(rate_limits) >= MAX_RATE_LIMIT_KEYS:
            # Remove expired clients before deciding whether a new key can be tracked.
            stale_keys = [
                name for name, values in rate_limits.items()
                if not values or values[-1] <= window_start
            ]
            for name in stale_keys:
                rate_limits.pop(name, None)
            # Refuse an untracked client rather than letting attacker-controlled
            # address churn grow this in-memory limiter without a hard bound.
            if len(rate_limits) >= MAX_RATE_LIMIT_KEYS:
                return False, 60

        stamps = rate_limits.setdefault(key, deque())
        while stamps and stamps[0] <= window_start:
            stamps.popleft()
        if len(stamps) >= MAX_EXECUTIONS_PER_MINUTE:
            retry_after = max(1, int(stamps[0] + 60 - now))
            return False, retry_after
        stamps.append(now)
    return True, 0

def normalize_idempotency_key(raw):
    candidate = str(raw or "").strip()
    if not candidate:
        return None
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,100}", candidate):
        raise ValueError("Idempotency-Key must contain only safe ASCII characters and be at most 100 characters")
    return candidate

def _retry_attempt_number(task):
    try:
        return max(0, min(int(task.get("retry_number") or 0), 1_000_000))
    except (TypeError, ValueError, OverflowError):
        return 0


def _task_retry_limit(task):
    """Return the retry cap recorded for this lineage, bounded to supported values."""
    try:
        limit = int(task.get("max_task_retries", MAX_TASK_RETRIES))
    except (TypeError, ValueError, OverflowError):
        limit = MAX_TASK_RETRIES
    return max(0, min(limit, 10))


def _effective_task_retry_limit(task):
    """Apply the active deployment cap as a stricter ceiling on a stored lineage cap."""
    return min(_task_retry_limit(task), MAX_TASK_RETRIES)


def task_summary(task):
    retry_number = _retry_attempt_number(task)
    retry_limit = _task_retry_limit(task)
    effective_retry_limit = _effective_task_retry_limit(task)
    status = str(task.get("status") or "").upper()
    artifacts = task.get("artifacts")
    if not isinstance(artifacts, list):
        artifacts = []
    events = task.get("events")
    if not isinstance(events, list):
        events = []
    static_analysis = task.get("static_analysis")
    if not isinstance(static_analysis, dict):
        static_analysis = {}
    return {
        "task_id": task["task_id"],
        "created_at": task.get("created_at"),
        "updated_at": task.get("updated_at"),
        "objective": task.get("objective", ""),
        "mode": task.get("mode"),
        "status": task.get("status"),
        "current_agent": task.get("current_agent"),
        "score": task.get("score", 0),
        "execution_time_ms": task.get("execution_time_ms", 0),
        "confidence": task.get("confidence", 0),
        "quality": task.get("quality", 0),
        "coverage": task.get("coverage", 0),
        "risk": task.get("risk", "LOW"),
        "summary": task.get("summary", ""),
        "tool_calls": task.get("tool_calls", 0),
        "tests_passed": task.get("tests_passed", 0),
        "tests_failed": task.get("tests_failed", 0),
        "artifact_count": len(artifacts),
        "event_count": len(events),
        "provider": task.get("provider", PROVIDER.name),
        "verification_status": task.get("verification_status", "UNKNOWN"),
        "score_method": task.get("score_method", "UNKNOWN"),
        "static_checks_passed": static_analysis.get("checks_passed", 0),
        "static_checks_failed": static_analysis.get("checks_failed", 0),
        "parent_task_id": task.get("parent_task_id"),
        "retry_number": retry_number,
        "retry_reason": task.get("retry_reason"),
        "max_task_retries": retry_limit,
        "effective_max_task_retries": effective_retry_limit,
        "can_retry": status in {"FAILED", "CANCELLED", "TIMED_OUT"} and retry_number < effective_retry_limit
    }

def persist_task(task):
    with history_lock:
        items = load_history()
        snapshot = {
        "task_id": task["task_id"],
        "created_at": task["created_at"],
        "updated_at": task.get("updated_at", task["created_at"]),
        "objective": task["objective"],
        "mode": task["mode"],
        "status": task["status"],
        "score": task.get("score", 0),
        "execution_time_ms": task.get("execution_time_ms", 0),
        "latency_ms": task.get("latency_ms", 0),
        "confidence": task.get("confidence", 0),
        "risk": task.get("risk", "LOW"),
        "summary": task.get("summary", ""),
        "artifacts": task.get("artifacts", []),
        "idempotency_key": task.get("idempotency_key"),
        "parent_task_id": task.get("parent_task_id"),
        "retry_number": _retry_attempt_number(task),
        "retry_reason": task.get("retry_reason"),
        "max_task_retries": task.get("max_task_retries", MAX_TASK_RETRIES),
        "current_agent": task.get("current_agent"),
        "tool_calls": task.get("tool_calls", 0),
        "plan": task.get("plan", []),
        "research": task.get("research", []),
        "tests_passed": task.get("tests_passed", 0),
        "tests_failed": task.get("tests_failed", 0),
        "coverage": task.get("coverage", 0),
        "quality": task.get("quality", 0),
        "agents": task.get("agents", []),
        "events": task.get("events", []),
        "provider": task.get("provider", PROVIDER.name),
        "model": task.get("model", ""),
        "implementation": task.get("implementation", ""),
        "validation_plan": task.get("validation_plan", []),
        "review": task.get("review", {}),
        "verification_status": task.get("verification_status", "UNKNOWN"),
        "score_method": task.get("score_method", "UNKNOWN"),
        "static_analysis": task.get("static_analysis", {}),
        "failure": task.get("failure")
        }
        items = [item for item in items if item["task_id"] != task["task_id"]]
        items.append(snapshot)
        save_history(items)

def event(task, agent, phase, message, duration_ms):
    task.setdefault("events", [])
    task.setdefault("event_sequence", 0)
    task["event_sequence"] += 1
    task["events"].append({
        "event_id": f"{task['task_id']}-E{task['event_sequence']:03d}",
        "timestamp": now_iso(),
        "time": datetime.now().strftime("%H:%M:%S"),
        "agent": agent,
        "phase": phase,
        "message": message,
        "duration": max(0, int(duration_ms))
    })
    task["updated_at"] = now_iso()

def recover_interrupted_runs():
    """Mark persisted work from a previous process as interrupted, never silently active."""
    with history_lock:
        records = load_history()
        recovered = 0
        for task in records:
            status = str(task.get("status") or "").upper()
            if status not in {"RUNNING", "QUEUED", "AWAITING_APPROVAL"}:
                continue

            previous_agent = str(task.get("current_agent") or "ORCHESTRATOR")
            task["status"] = "FAILED"
            task["updated_at"] = now_iso()
            task["failure"] = {
                "type": "RuntimeRestart",
                "message": "The backend restarted before this execution reached a terminal state. This run is incomplete; start a new execution to continue.",
            }
            task["summary"] = "Execution interrupted by a backend restart. This result is incomplete and must not be treated as successful."
            task["verification_status"] = "INTERRUPTED_NOT_VERIFIED"
            agents_list = task.get("agents")
            if isinstance(agents_list, list):
                for agent in agents_list:
                    if isinstance(agent, dict) and str(agent.get("status") or "").upper() in {"RUNNING", "QUEUED", "AWAITING_APPROVAL"}:
                        agent["status"] = "FAILED"

            events_list = task.get("events")
            if not isinstance(events_list, list):
                events_list = []
                task["events"] = events_list
            sequences = []
            for entry in events_list:
                if not isinstance(entry, dict):
                    continue
                match = re.fullmatch(r".*-E(\d+)", str(entry.get("event_id") or ""))
                if match:
                    sequences.append(int(match.group(1)))
            task["event_sequence"] = max(sequences, default=0)
            event(
                task,
                previous_agent,
                "RUNTIME_RECOVERY",
                "Marked this persisted run interrupted because its worker was not present after backend restart.",
                0,
            )
            recovered += 1
        if recovered:
            save_history(records)
        return recovered


RECOVERED_INTERRUPTED_RUNS = recover_interrupted_runs()


def artifact(name, language, size, kind, content=None):
    item = {"name": name, "language": language, "size": size, "type": kind}
    if content is not None:
        item["content"] = content
    return item

def build_demo_plan(prompt):
    return PROVIDER.plan(prompt)

def check_task_cancelled(task):
    cancel_event = runtime["cancel_events"].get(task["task_id"])
    if cancel_event is not None and cancel_event.is_set():
        raise TaskCancelled("Task cancellation requested")


def cooperative_wait(task, seconds):
    cancel_event = runtime["cancel_events"].get(task["task_id"])
    if cancel_event is None:
        cancel_event = threading.Event()
    deadline = time.monotonic() + seconds
    while True:
        if cancel_event.is_set():
            raise TaskCancelled("Task cancellation requested")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        cancel_event.wait(timeout=min(0.1, remaining))

def wait_for_supervised_approval(task):
    """Wait for release approval without exceeding the task's wall-clock budget."""
    started_at = task.get("_runtime_started_monotonic", time.perf_counter())
    approval_event = runtime["approval_events"].get(task["task_id"])
    cancel_event = runtime["cancel_events"].get(task["task_id"])
    if approval_event is None:
        raise RuntimeError("Supervised approval control is unavailable")
    deadline = started_at + MAX_TASK_RUNTIME_SECONDS
    while True:
        if cancel_event and cancel_event.is_set():
            raise TaskCancelled("Task cancellation requested")
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            raise TaskTimedOut(f"Execution exceeded the {MAX_TASK_RUNTIME_SECONDS}-second task deadline")
        if approval_event.wait(timeout=min(0.1, remaining)):
            return

def execute_task(task):
    try:
        _run_task(task)
    except TaskCancelled as exc:
        with runtime["lock"]:
            task["status"] = "CANCELLED"
            task["failure"] = {"type": type(exc).__name__, "message": str(exc)}
            task["summary"] = "CYRUS cancelled the execution at the next safe cooperative checkpoint."
            task["updated_at"] = now_iso()
            for item in task.get("agents", []):
                if item.get("name") == task.get("current_agent"):
                    item["status"] = "CANCELLED"
            event(task, task.get("current_agent", "ORCHESTRATOR"), "CANCELLED", "Execution stopped by operator request.", 0)
        persist_task(task)
    except TaskTimedOut as exc:
        with runtime["lock"]:
            task["status"] = "TIMED_OUT"
            task["failure"] = {"type": type(exc).__name__, "message": str(exc)[:500]}
            task["summary"] = "CYRUS stopped the execution because its configured task deadline expired."
            task["updated_at"] = now_iso()
            task["execution_time_ms"] = max(0, int((time.perf_counter() - task.get("_runtime_started_monotonic", time.perf_counter())) * 1000))
            for item in task.get("agents", []):
                if item.get("name") == task.get("current_agent"):
                    item["status"] = "TIMED_OUT"
            event(task, task.get("current_agent", "ORCHESTRATOR"), "TIMED_OUT", "Execution stopped at its configured task deadline.", 0)
        persist_task(task)
    except Exception as exc:
        with runtime["lock"]:
            task["status"] = "FAILED"
            task["current_agent"] = task.get("current_agent", "ORCHESTRATOR")
            task["failure"] = {"type": type(exc).__name__, "message": str(exc)[:500]}
            task["summary"] = "CYRUS stopped the execution after a provider or internal runtime failure."
            task["updated_at"] = now_iso()
            for item in task.get("agents", []):
                if item.get("name") == task.get("current_agent"):
                    item["status"] = "FAILED"
            event(task, task["current_agent"], "FAILURE", "Execution failed safely. Inspect the failure payload and request ID.", 0)
        persist_task(task)
    finally:
        # These maps share lifecycle with task creation and API cancellation.
        with runtime["lock"]:
            runtime["futures"].pop(task["task_id"], None)
            runtime["cancel_events"].pop(task["task_id"], None)
            runtime["approval_events"].pop(task["task_id"], None)

def _run_task(task):
    """Execute real provider work and publish durable stage-by-stage progress."""
    started = time.perf_counter()
    task["_runtime_started_monotonic"] = started
    stages = [
        ("ORCHESTRATOR", "INITIALIZATION", "Initialize objective and execution context"),
        ("PLANNER", "DECOMPOSITION", "Create an objective-specific plan"),
        ("RESEARCHER", "EVIDENCE", "Draft engineering considerations"),
        ("CODER", "IMPLEMENTATION", "Produce an implementation draft"),
        ("TESTER", "VALIDATION", "Produce a validation plan"),
        ("REVIEWER", "ASSURANCE", "Review the draft and identify risks"),
        ("RELEASE", "DELIVERY", "Package draft artifacts and execution metadata"),
    ]

    for index, (agent, phase, action_label) in enumerate(stages):
        check_task_cancelled(task)
        if time.perf_counter() - started > MAX_TASK_RUNTIME_SECONDS:
            raise TaskTimedOut(f"Execution exceeded the {MAX_TASK_RUNTIME_SECONDS}-second task deadline")
        with runtime["lock"]:
            task["status"] = "RUNNING"
            task["current_agent"] = agent
            task["updated_at"] = now_iso()
            for item in task["agents"]:
                item["status"] = (
                    "RUNNING" if item["name"] == agent
                    else ("COMPLETED" if item["id"] < index + 1 else "QUEUED")
                )
            event(task, agent, phase + "_STARTED", action_label + ".", 0)
        # Persist start markers before any remote model request so the stream and
        # history show which stage is currently in progress.
        persist_task(task)
        stage_started = time.perf_counter()

        if agent == "ORCHESTRATOR":
            stage_message = "Execution initialized using provider " + PROVIDER.name + "."
        elif agent == "PLANNER":
            task["plan"] = PROVIDER.plan(task["objective"])
            stage_message = "Generated " + str(len(task["plan"])) + " plan steps."
        elif agent == "RESEARCHER":
            task["research"] = PROVIDER.research(task["objective"])
            task["research_source"] = (
                "MODEL_DRAFT_NO_EXTERNAL_SEARCH" if PROVIDER.mode == "LIVE"
                else "DETERMINISTIC_DEMO_HEURISTICS"
            )
            stage_message = (
                "Generated " + str(len(task["research"])) +
                " engineering considerations; no external web search was performed."
            )
        elif agent == "CODER":
            task["implementation"] = PROVIDER.implement(
                task["objective"], task.get("plan", []), task.get("research", [])
            )
            stage_message = (
                "Produced an implementation draft of " +
                str(len(task["implementation"])) +
                " characters; repository files were not changed."
            )
        elif agent == "TESTER":
            task["validation_plan"] = PROVIDER.validation_plan(
                task["objective"], task.get("implementation", "")
            )
            task["static_analysis"] = analyze_draft(task.get("implementation", ""))
            task["verification_status"] = "STATIC_ANALYSIS_EXECUTED;PROPOSED_TESTS_NOT_EXECUTED"
            task["tests_passed"] = 0
            task["tests_failed"] = 0
            task["coverage"] = 0
            task["tool_calls"] += 1
            stage_message = (
                "Ran " + str(len(task["static_analysis"].get("checks", []))) +
                " non-executing static checks: " +
                str(task["static_analysis"].get("checks_passed", 0)) + " passed, " +
                str(task["static_analysis"].get("checks_failed", 0)) + " failed. " +
                "Proposed application tests were not executed."
            )
        elif agent == "REVIEWER":
            task["review"] = PROVIDER.review(
                task["objective"], task.get("plan", []),
                task.get("implementation", ""), task.get("validation_plan", [])
            )
            task["quality"] = int(task["review"].get("quality", 0))
            task["confidence"] = int(task["review"].get("confidence", 0))
            task["risk"] = str(task["review"].get("risk", "UNKNOWN"))
            task["score"] = round((task["quality"] + task["confidence"]) / 2, 1)
            task["score_method"] = (
                "Model-estimated design quality and confidence; not test results"
                if PROVIDER.mode == "LIVE"
                else "Unavailable in deterministic demo mode"
            )
            stage_message = (
                "Completed a model-based design review."
                if PROVIDER.mode == "LIVE"
                else "Skipped model scoring: deterministic demo provider has no AI reviewer."
            )
        else:
            implementation = task.get("implementation", "")
            validation_text = "# Proposed validation plan\n\n" + "\n".join(
                f"{number}. {check}"
                for number, check in enumerate(task.get("validation_plan", []), 1)
            ) + "\n\nStatus: NOT EXECUTED. These checks were proposed, not run.\n"
            review_text = json.dumps(task.get("review", {}), indent=2)
            task["artifacts"] = [
                artifact(
                    "implementation.md", "Markdown",
                    f"{max(1, len(implementation.encode('utf-8'))) / 1024:.1f} KB",
                    "implementation draft", implementation
                ),
                artifact(
                    "validation-plan.md", "Markdown",
                    f"{max(1, len(validation_text.encode('utf-8'))) / 1024:.1f} KB",
                    "proposed checks", validation_text
                ),
                artifact(
                    "review.json", "JSON",
                    f"{max(1, len(review_text.encode('utf-8'))) / 1024:.1f} KB",
                    "design review", review_text
                ),
            ]
            static_text = json.dumps(task.get("static_analysis", {}), indent=2)
            task["artifacts"].append(artifact(
                "static-analysis.json", "JSON",
                f"{max(1, len(static_text.encode('utf-8'))) / 1024:.1f} KB",
                "non-executing static analysis", static_text
            ))
            stage_message = "Packaged the implementation draft, proposed validation checks, review metadata, and static-analysis report."

        check_task_cancelled(task)
        if time.perf_counter() - started > MAX_TASK_RUNTIME_SECONDS:
            raise TaskTimedOut(f"Execution exceeded the {MAX_TASK_RUNTIME_SECONDS}-second task deadline")
        observed_duration = int((time.perf_counter() - stage_started) * 1000)
        with runtime["lock"]:
            for item in task["agents"]:
                if item["name"] == agent:
                    item["status"] = "COMPLETED"
            event(task, agent, phase + "_COMPLETED", stage_message, observed_duration)
            task["updated_at"] = now_iso()
        persist_task(task)

        if agent == "REVIEWER" and task["mode"] == "supervised":
            with runtime["lock"]:
                task["status"] = "AWAITING_APPROVAL"
                task["approval_required"] = True
                task["updated_at"] = now_iso()
                event(
                    task, "REVIEWER", "APPROVAL",
                    "Supervised mode paused after review; operator approval is required to package the output.",
                    0,
                )
            persist_task(task)
            wait_for_supervised_approval(task)
            with runtime["lock"]:
                task["status"] = "RUNNING"
                task["approval_required"] = False
                task["approved_at"] = now_iso()
                event(task, "ORCHESTRATOR", "APPROVED", "Operator approval received; packaging resumed.", 0)
            persist_task(task)

    elapsed = int((time.perf_counter() - started) * 1000)
    with runtime["lock"]:
        task["execution_time_ms"] = elapsed
        task["latency_ms"] = elapsed
        task["status"] = "COMPLETED"
        task["current_agent"] = "RELEASE"
        task["verification_status"] = task.get("verification_status", "PLAN_GENERATED_NOT_EXECUTED")
        task["updated_at"] = now_iso()
        if PROVIDER.mode == "LIVE":
            task["summary"] = (
                "Model-assisted workflow completed. Review scores are estimates; an implementation draft and "
                "validation plan are available. " +
                str(task.get("static_analysis", {}).get("checks_passed", 0)) +
                " static checks passed and " +
                str(task.get("static_analysis", {}).get("checks_failed", 0)) +
                " failed; code was not executed and the proposed application tests were not run."
            )
        else:
            task["summary"] = (
                "Deterministic demo workflow completed. Configure CYRUS_LLM_API_KEY in the Render environment "
                "for model-powered planning, implementation, and design review. " +
                str(task.get("static_analysis", {}).get("checks_passed", 0)) +
                " static checks passed and " +
                str(task.get("static_analysis", {}).get("checks_failed", 0)) +
                " failed; proposed application tests were not executed."
            )
        event(
            task, "RELEASE", "EXECUTION_COMPLETED",
            "Execution record finalized. No automated code execution or test pass was claimed.",
            0,
        )
    persist_task(task)

def prune_live_tasks_locked():
    terminal = [
        task for task in runtime["tasks"].values()
        if task.get("status") in {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
    ]
    overflow = max(0, len(runtime["tasks"]) - MAX_LIVE_TASKS)
    if overflow:
        terminal.sort(key=lambda task: task.get("updated_at", ""))
        for task in terminal[:overflow]:
            task_id = task["task_id"]
            runtime["tasks"].pop(task_id, None)

def create_task(prompt, mode, idempotency_key=None, parent_task_id=None, retry_number=0, retry_reason=None, max_task_retries=None):
    task_id = "CYRUS-" + uuid.uuid4().hex[:8].upper()
    task = {
        "task_id": task_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "objective": prompt,
        "mode": mode,
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
        "provider": PROVIDER.name,
        "model": getattr(PROVIDER, "model", "") or "",
        "implementation": "",
        "validation_plan": [],
        "review": {},
        "verification_status": "PENDING",
        "score_method": "UNSCORED",
        "static_analysis": {},
        "idempotency_key": idempotency_key,
        "parent_task_id": parent_task_id,
        "retry_number": max(0, min(int(retry_number or 0), 1_000_000)),
        "retry_reason": retry_reason,
        "max_task_retries": MAX_TASK_RETRIES if max_task_retries is None else max(0, min(int(max_task_retries), 10)),
        "events": [],
        "agents": [dict(agent, status="QUEUED") for agent in AGENTS]
    }
    if parent_task_id:
        event(
            task,
            "ORCHESTRATOR",
            "RETRY_CREATED",
            f"Created retry {task['retry_number']} from {parent_task_id}; previous outcome: {retry_reason or 'terminal failure'}.",
            0,
        )
    with runtime["lock"]:
        active = sum(1 for item in runtime["tasks"].values() if item.get("status") in {"RUNNING", "AWAITING_APPROVAL"})
        if active >= MAX_CONCURRENT_TASKS:
            raise CapacityError("CYRUS worker capacity is currently full")
        runtime["tasks"][task_id] = task
        runtime["cancel_events"][task_id] = threading.Event()
        runtime["approval_events"][task_id] = threading.Event()
        prune_live_tasks_locked()
    try:
        future = runtime["executor"].submit(execute_task, task)
    except Exception:
        with runtime["lock"]:
            runtime["tasks"].pop(task_id, None)
            runtime["cancel_events"].pop(task_id, None)
            runtime["approval_events"].pop(task_id, None)
        raise
    with runtime["lock"]:
        runtime["futures"][task_id] = future
        # A very short task may finish before submit() returns and its worker
        # cleanup runs before this Future is registered. Do not retain it stale.
        if future.done():
            runtime["futures"].pop(task_id, None)
    return task

@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

PUBLIC_ASSETS = {"styles.css", "app.js", "demo-bridge.js", "runtime-config.js", "event-stream.js"}

@app.get("/<path:name>")
def public_asset(name):
    if name not in PUBLIC_ASSETS:
        return jsonify({"error": "Resource not found"}), 404
    return send_from_directory(BASE_DIR, name)

@app.get("/api/security")
def security_info():
    """Expose security posture, never the configured access-key value."""
    provider_is_live = getattr(globals().get("PROVIDER"), "mode", "DEMO") == "LIVE"
    return jsonify({
        "api_access_key_required": bool(API_ACCESS_KEY) or provider_is_live,
        "api_access_key_configured": bool(API_ACCESS_KEY),
        "live_model_locked": provider_is_live and not API_ACCESS_KEY,
        "protected_routes": "all /api routes except GET health, readiness, provider, and preflight",
        "access_key_header": "X-CYRUS-Access-Key",
        "model_key_in_browser": False,
        "key_storage_in_browser": "sessionStorage per tab; only the API access key is accepted by the UI",
    })


@app.get("/api/health")
def health():
    with runtime["lock"]:
        active = sum(
            1 for task in runtime["tasks"].values()
            if task.get("status") in {"RUNNING", "AWAITING_APPROVAL"}
        )
    utilization = round(active / MAX_CONCURRENT_TASKS, 3)
    live_model_locked = PROVIDER.mode == "LIVE" and not API_ACCESS_KEY
    ready = active < MAX_CONCURRENT_TASKS and not live_model_locked
    return jsonify({
        "status": "ok",
        "system": "CYRUS CORE 1.0",
        "mode": PROVIDER.mode,
        "provider": PROVIDER.name,
        "provider_status": PROVIDER.status,
        "model_available": PROVIDER.mode == "LIVE",
        "model": getattr(PROVIDER, "model", "") or None,
        "provider_configured": PROVIDER.mode == "LIVE",
        "api_access_key_required": bool(API_ACCESS_KEY) or PROVIDER.mode == "LIVE",
        "api_access_key_configured": bool(API_ACCESS_KEY),
        "live_model_locked": live_model_locked,
        "release": RELEASE_ID,
        "started_at": datetime.fromtimestamp(runtime["started_at"], timezone.utc).isoformat().replace("+00:00", "Z"),
        "worker_capacity": MAX_CONCURRENT_TASKS,
        "active_tasks": active,
        "capacity_utilization": utilization,
        "ready": ready,
        "history_store": HISTORY_STORE.info()
    })

@app.get("/api/provider")
def provider_info():
    """Expose provider capability without ever returning credentials."""
    live = PROVIDER.mode == "LIVE"
    return jsonify({
        "provider": PROVIDER.name,
        "mode": PROVIDER.mode,
        "status": PROVIDER.status,
        "model_available": live,
        "model": getattr(PROVIDER, "model", "") or None,
        "supports_model_generation": live,
        "supports_external_search": False,
        "supports_code_execution": False,
        "message": (
            "A live model provider is configured, but private routes remain locked until CYRUS_API_ACCESS_KEY is set."
            if live and not API_ACCESS_KEY else
            "Model requests are enabled. Responses are drafts and code is not executed."
            if live else
            "Deterministic demo mode is active. Set CYRUS_LLM_API_KEY and optionally "
            "CYRUS_LLM_BASE_URL/CYRUS_LLM_MODEL in the hosting environment to enable model output."
        ),
    })


@app.get("/api/ready")
def readiness():
    with runtime["lock"]:
        active = sum(
            1 for task in runtime["tasks"].values()
            if task.get("status") in {"RUNNING", "AWAITING_APPROVAL"}
        )
    live_model_locked = PROVIDER.mode == "LIVE" and not API_ACCESS_KEY
    capacity_available = active < MAX_CONCURRENT_TASKS
    ready = capacity_available and not live_model_locked
    payload = {
        "ready": ready,
        "active_tasks": active,
        "worker_capacity": MAX_CONCURRENT_TASKS,
        "provider": PROVIDER.name,
        "live_model_locked": live_model_locked,
        "api_access_key_required": bool(API_ACCESS_KEY) or PROVIDER.mode == "LIVE",
        "api_access_key_configured": bool(API_ACCESS_KEY),
        "reason": (
            "live_model_requires_api_access_key" if live_model_locked else
            "worker_capacity_full" if not capacity_available else None
        ),
    }
    return jsonify(payload), 200 if ready else 503

@app.get("/api/agents")
def agents():
    return jsonify(AGENTS)

@app.get("/api/tools")
def tools():
    return jsonify(TOOLS)

def runtime_metrics():
    history = load_history()
    records = all_task_records()
    with runtime["lock"]:
        live = list(runtime["tasks"].values())
        active = sum(1 for task in live if task.get("status") in {"RUNNING", "AWAITING_APPROVAL"})
        awaiting = sum(1 for task in live if task.get("status") == "AWAITING_APPROVAL")
        queued = sum(1 for task in live if task.get("status") == "QUEUED")
    states = [str(item.get("status") or "UNKNOWN").upper() for item in records]
    completed = states.count("COMPLETED")
    failed = states.count("FAILED")
    cancelled = states.count("CANCELLED")
    timed_out = states.count("TIMED_OUT")
    terminal_states = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
    historical = [item for item in records if str(item.get("status") or "").upper() in terminal_states]
    latencies = []
    for item in historical:
        try:
            value = int(item.get("execution_time_ms") or 0)
            if value > 0:
                latencies.append(value)
        except (TypeError, ValueError):
            continue
    return {
        "system": "CYRUS CORE 1.0",
        "release": RELEASE_ID,
        "uptime_seconds": round(max(0, time.time() - runtime["started_at"]), 1),
        "capacity": MAX_CONCURRENT_TASKS,
        "total_tasks": len(records),
        "active_tasks": active,
        "queued_tasks": queued,
        "awaiting_approval": awaiting,
        "completed_tasks": completed,
        "failed_tasks": failed,
        "cancelled_tasks": cancelled,
        "timed_out_tasks": timed_out,
        "model_mode": PROVIDER.mode,
        "provider": PROVIDER.name,
        "api_access_key_required": bool(API_ACCESS_KEY),
        "persisted_tasks": len(history),
        "average_execution_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0,
        "history_store": HISTORY_STORE.info()
    }

@app.get("/api/metrics")
def metrics():
    return jsonify(runtime_metrics())

def all_task_records():
    """Merge live task state over its persisted snapshot without duplicate IDs."""
    merged = {item["task_id"]: item for item in load_history() if item.get("task_id")}
    with runtime["lock"]:
        live = list(runtime["tasks"].values())
    for item in live:
        task_id = item.get("task_id")
        if task_id:
            merged[str(task_id)] = item
    return sorted(merged.values(), key=lambda item: str(item.get("created_at") or ""), reverse=True)


@app.get("/api/tasks")
def tasks():
    try:
        limit = max(1, min(int(request.args.get("limit", "50")), 100))
        offset = max(0, min(int(request.args.get("offset", "0")), 10000))
    except ValueError:
        return jsonify({"error": "limit and offset must be integers"}), 400
    status = request.args.get("status", "").strip().upper()
    allowed_statuses = {"QUEUED", "RUNNING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
    if status and status not in allowed_statuses:
        return jsonify({"error": "Unsupported task status filter"}), 400
    mode = request.args.get("mode", "").strip().lower()
    if mode and mode not in {"autonomous", "supervised"}:
        return jsonify({"error": "Unsupported task mode filter"}), 400
    query = request.args.get("q", "").strip().lower()[:200]
    results = [task_summary(item) for item in all_task_records()]
    if status:
        results = [item for item in results if item.get("status") == status]
    if mode:
        results = [item for item in results if item.get("mode") == mode]
    if query:
        results = [
            item for item in results
            if query in str(item.get("objective", "")).lower()
            or query in str(item.get("summary", "")).lower()
            or query in str(item.get("task_id", "")).lower()
            or query in str(item.get("current_agent", "")).lower()
            or query in str(item.get("mode", "")).lower()
        ]
    return jsonify(results[offset:offset + limit])


@app.get("/api/analytics")
def analytics():
    try:
        days = max(1, min(int(request.args.get("days", "7")), 90))
    except ValueError:
        return jsonify({"error": "days must be an integer between 1 and 90"}), 400

    records = all_task_records()
    now = datetime.now(timezone.utc)
    start_date = now.date() - timedelta(days=days - 1)
    terminal_statuses = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
    status_counts = {name: 0 for name in (
        "RUNNING", "QUEUED", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"
    )}
    daily = {}
    latency_samples = []
    provider_counts = {}
    failure_counts = {}
    for index in range(days):
        day = start_date + timedelta(days=index)
        daily[day.isoformat()] = {
            "date": day.isoformat(), "label": day.strftime("%d %b"),
            "total": 0, "completed": 0, "failed": 0, "cancelled": 0, "timed_out": 0
        }

    for item in records:
        state = str(item.get("status", "UNKNOWN")).upper()
        if state in status_counts:
            status_counts[state] += 1
        provider = str(item.get("provider") or "unknown")
        provider_counts[provider] = provider_counts.get(provider, 0) + 1

        created = None
        raw_created = item.get("created_at")
        if isinstance(raw_created, str):
            try:
                created = datetime.fromisoformat(raw_created.replace("Z", "+00:00"))
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
            except ValueError:
                created = None
        if created and start_date <= created.date() <= now.date():
            bucket = daily.get(created.date().isoformat())
            if bucket:
                bucket["total"] += 1
                if state == "COMPLETED":
                    bucket["completed"] += 1
                elif state == "FAILED":
                    bucket["failed"] += 1
                elif state == "CANCELLED":
                    bucket["cancelled"] += 1
                elif state == "TIMED_OUT":
                    bucket["timed_out"] += 1

        if state in terminal_statuses:
            try:
                value = int(item.get("execution_time_ms") or 0)
                if value > 0:
                    latency_samples.append(value)
            except (TypeError, ValueError):
                pass
        failure = item.get("failure") or {}
        failure_type = str(failure.get("type") or "") if isinstance(failure, dict) else ""
        if failure_type:
            failure_counts[failure_type] = failure_counts.get(failure_type, 0) + 1

    terminal_total = sum(status_counts[name] for name in terminal_statuses)
    latencies = sorted(latency_samples)
    median = 0
    p95 = 0
    if latencies:
        middle = len(latencies) // 2
        median = latencies[middle] if len(latencies) % 2 else round((latencies[middle - 1] + latencies[middle]) / 2)
        p95 = latencies[max(0, math.ceil(0.95 * len(latencies)) - 1)]
    return jsonify({
        "generated_at": now_iso(),
        "window_days": days,
        "source": "database_history_and_live_runtime",
        "totals": {
            "all": len(records),
            "completed": status_counts["COMPLETED"],
            "failed": status_counts["FAILED"],
            "cancelled": status_counts["CANCELLED"],
            "timed_out": status_counts["TIMED_OUT"],
            "running": status_counts["RUNNING"],
            "queued": status_counts["QUEUED"],
            "awaiting_approval": status_counts["AWAITING_APPROVAL"],
            "terminal": terminal_total,
            "success_rate": round(status_counts["COMPLETED"] / terminal_total * 100, 1) if terminal_total else 0,
        },
        "daily": list(daily.values()),
        "providers": [
            {"name": name, "count": count}
            for name, count in sorted(provider_counts.items(), key=lambda pair: pair[1], reverse=True)
        ],
        "latency": {
            "samples": len(latencies),
            "average_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0,
            "median_ms": median,
            "p95_ms": p95,
            "maximum_ms": max(latencies) if latencies else 0,
        },
        "failure_types": [
            {"type": name, "count": count}
            for name, count in sorted(failure_counts.items(), key=lambda pair: pair[1], reverse=True)[:6]
        ],
        "recent_tasks": [task_summary(item) for item in records[:8]],
        "history_store": HISTORY_STORE.info(),
    })

@app.post("/api/tasks/<task_id>/approve")
def approve_task(task_id):
    with runtime["lock"]:
        task = runtime["tasks"].get(task_id)
        if not task:
            return jsonify({"error": "Task not found"}), 404
        if task.get("status") != "AWAITING_APPROVAL":
            return jsonify({
                "error": "Task is not awaiting approval",
                "status": task.get("status")
            }), 409
        approval_event = runtime["approval_events"].get(task_id)
        if approval_event is None:
            return jsonify({"error": "Approval control is unavailable"}), 503
        task["approval_requested_at"] = now_iso()
        approval_event.set()
    persist_task(task)
    return jsonify({
        "task_id": task_id,
        "status": "APPROVAL_GRANTED",
        "summary": "CYRUS will resume the release stage."
    }), 202

@app.post("/api/tasks/<task_id>/retry")
def retry_task(task_id):
    """Create a fresh execution from a terminal task, preserving retry lineage."""
    with runtime["lock"]:
        source = runtime["tasks"].get(task_id)
    if source is None:
        source = next(
            (item for item in reversed(load_history()) if item.get("task_id") == task_id),
            None,
        )
    if source is None:
        return jsonify({"error": "Task not found"}), 404

    source_status = str(source.get("status") or "").upper()
    if source_status not in {"FAILED", "CANCELLED", "TIMED_OUT"}:
        return jsonify({
            "error": "Only failed, cancelled, or timed-out tasks can be retried",
            "status": source_status or "UNKNOWN",
        }), 409

    previous_retry_number = _retry_attempt_number(source)
    lineage_retry_limit = _task_retry_limit(source)
    retry_limit = _effective_task_retry_limit(source)
    if previous_retry_number >= retry_limit:
        return jsonify({
            "error": "The configured retry limit has been reached for this execution lineage",
            "retry_number": previous_retry_number,
            "max_task_retries": lineage_retry_limit,
            "effective_max_task_retries": retry_limit,
        }), 409

    objective = source.get("objective")
    mode = source.get("mode", "autonomous")
    if not isinstance(objective, str) or not objective.strip():
        return jsonify({"error": "The source task has no valid objective to retry"}), 409
    objective = objective.strip()
    if mode not in {"autonomous", "supervised"}:
        return jsonify({"error": "The source task has an invalid execution mode"}), 409

    try:
        idempotency_key = normalize_idempotency_key(request.headers.get("Idempotency-Key"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    allowed, retry_after = rate_limit_execution(request.remote_addr)
    if not allowed:
        limited = jsonify({
            "error": "Execution submission rate limit exceeded",
            "retry_after_seconds": retry_after,
        })
        limited.headers["Retry-After"] = str(retry_after)
        return limited, 429

    next_retry_number = previous_retry_number + 1
    failure = source.get("failure")
    failure_type = failure.get("type") if isinstance(failure, dict) else None
    retry_reason = source_status + (":" + str(failure_type)[:80] if failure_type else "")
    fingerprint = {
        "prompt": objective,
        "mode": mode,
        "retry_of": task_id,
        "retry_number": next_retry_number,
    }

    if idempotency_key:
        with runtime["lock"]:
            existing = runtime["idempotency"].get(idempotency_key)
            if existing:
                if existing.get("fingerprint") != fingerprint:
                    return jsonify({"error": "Idempotency-Key was already used for a different request"}), 409
                existing_task = runtime["tasks"].get(existing.get("task_id")) if existing.get("task_id") else None
                if existing_task:
                    return jsonify({
                        "task_id": existing_task["task_id"],
                        "status": existing_task.get("status", "RUNNING"),
                        "retry_of": task_id,
                        "retry_number": next_retry_number,
                        "max_task_retries": _task_retry_limit(existing_task),
                        "effective_max_task_retries": _effective_task_retry_limit(existing_task),
                        "deduplicated": True,
                    }), 200
                historical = find_history_by_idempotency(idempotency_key)
                if historical:
                    return jsonify({
                        "task_id": historical["task_id"],
                        "status": historical.get("status", "UNKNOWN"),
                        "retry_of": task_id,
                        "retry_number": _retry_attempt_number(historical),
                        "max_task_retries": _task_retry_limit(historical),
                        "effective_max_task_retries": _effective_task_retry_limit(historical),
                        "deduplicated": True,
                    }), 200
                return jsonify({"error": "Retry with this Idempotency-Key is already being created"}), 409

            historical = find_history_by_idempotency(idempotency_key)
            if historical:
                same_retry = (
                    historical.get("parent_task_id") == task_id
                    and _retry_attempt_number(historical) == next_retry_number
                    and historical.get("objective") == objective
                    and historical.get("mode", "autonomous") == mode
                )
                if not same_retry:
                    return jsonify({"error": "Idempotency-Key was already used for a different request"}), 409
                runtime["idempotency"][idempotency_key] = {
                    "fingerprint": fingerprint,
                    "task_id": historical["task_id"],
                }
                return jsonify({
                    "task_id": historical["task_id"],
                    "status": historical.get("status", "UNKNOWN"),
                    "retry_of": task_id,
                    "retry_number": next_retry_number,
                    "max_task_retries": _task_retry_limit(historical),
                    "effective_max_task_retries": _effective_task_retry_limit(historical),
                    "deduplicated": True,
                }), 200

            runtime["idempotency"][idempotency_key] = {
                "fingerprint": fingerprint,
                "task_id": None,
            }

    # Reserve a source lineage before scanning history or submitting the worker.
    # Without the reservation two simultaneous requests with different keys could
    # both observe "no child" and start sibling executions.
    with runtime["lock"]:
        if task_id in runtime["retry_reservations"]:
            if idempotency_key:
                runtime["idempotency"].pop(idempotency_key, None)
            return jsonify({
                "error": "A retry is already being created for this task",
                "status": "RETRY_IN_PROGRESS",
                "retry_of": task_id,
                "max_task_retries": lineage_retry_limit,
                "effective_max_task_retries": retry_limit,
            }), 409
        runtime["retry_reservations"].add(task_id)

    try:
        # A task may have one direct retry child. If a caller retries the same
        # source with a fresh key (for example after losing the first response),
        # return that attempt instead of creating parallel siblings.
        existing_retry = next(
            (
                item for item in all_task_records()
                if item.get("parent_task_id") == task_id
                and _retry_attempt_number(item) == next_retry_number
            ),
            None,
        )
        if existing_retry:
            if idempotency_key:
                with runtime["lock"]:
                    entry = runtime["idempotency"].get(idempotency_key)
                    if entry and entry.get("fingerprint") == fingerprint:
                        entry["task_id"] = existing_retry["task_id"]
            return jsonify({
                "task_id": existing_retry["task_id"],
                "status": existing_retry.get("status", "UNKNOWN"),
                "mode": existing_retry.get("mode", mode),
                "retry_of": task_id,
                "retry_number": next_retry_number,
                "max_task_retries": _task_retry_limit(existing_retry),
                "effective_max_task_retries": _effective_task_retry_limit(existing_retry),
                "deduplicated": True,
            }), 200

        try:
            task = create_task(
                objective,
                mode,
                idempotency_key=idempotency_key,
                parent_task_id=task_id,
                retry_number=next_retry_number,
                retry_reason=retry_reason,
                max_task_retries=lineage_retry_limit,
            )
            if idempotency_key:
                with runtime["lock"]:
                    runtime["idempotency"][idempotency_key]["task_id"] = task["task_id"]
        except CapacityError as exc:
            if idempotency_key:
                with runtime["lock"]:
                    runtime["idempotency"].pop(idempotency_key, None)
            return jsonify({"error": str(exc)}), 429
        except Exception:
            if idempotency_key:
                with runtime["lock"]:
                    runtime["idempotency"].pop(idempotency_key, None)
            raise

        return jsonify({
            "task_id": task["task_id"],
            "status": task["status"],
            "mode": mode,
            "retry_of": task_id,
            "retry_number": next_retry_number,
            "max_task_retries": lineage_retry_limit,
            "effective_max_task_retries": retry_limit,
            "deduplicated": False,
        }), 202
    finally:
        with runtime["lock"]:
            runtime["retry_reservations"].discard(task_id)
            # If the attempt failed before a child ID was assigned, release
            # this request's placeholder key so the caller can safely retry.
            if idempotency_key:
                entry = runtime["idempotency"].get(idempotency_key)
                if (
                    entry
                    and entry.get("fingerprint") == fingerprint
                    and not entry.get("task_id")
                ):
                    runtime["idempotency"].pop(idempotency_key, None)

@app.post("/api/tasks/<task_id>/cancel")
def cancel_task(task_id):
    with runtime["lock"]:
        task = runtime["tasks"].get(task_id)
        if not task:
            return jsonify({"error": "Task not found"}), 404
        if task.get("status") not in {"RUNNING", "AWAITING_APPROVAL"}:
            return jsonify({
                "error": "Only running or approval-pending tasks can be cancelled",
                "status": task.get("status")
            }), 409
        cancel_event = runtime["cancel_events"].get(task_id)
        if cancel_event is None:
            return jsonify({"error": "Cancellation control is unavailable"}), 503
        task["cancel_requested"] = True
        task["updated_at"] = now_iso()
        event(task, task.get("current_agent", "ORCHESTRATOR"), "CANCEL_REQUESTED", "Operator requested cooperative cancellation.", 0)
        cancel_event.set()
    persist_task(task)
    return jsonify({
        "task_id": task_id,
        "status": "CANCELLATION_REQUESTED",
        "summary": "CYRUS will stop at the next safe execution checkpoint."
    }), 202


def _sse_message(event_name, payload, event_id=None):
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_name}")
    encoded = json.dumps(payload, separators=(",", ":"))
    for line in encoded.splitlines() or [""]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def _task_stream_snapshot(task):
    return {
        "task_id": task["task_id"],
        "status": task.get("status"),
        "current_agent": task.get("current_agent"),
        "updated_at": task.get("updated_at"),
        "approval_required": bool(task.get("approval_required")),
        "score": task.get("score", 0),
        "confidence": task.get("confidence", 0),
        "quality": task.get("quality", 0),
        "coverage": task.get("coverage", 0),
        "risk": task.get("risk", "LOW"),
        "tool_calls": task.get("tool_calls", 0),
        "verification_status": task.get("verification_status", "UNKNOWN"),
        "static_checks_passed": task.get("static_analysis", {}).get("checks_passed", 0),
        "static_checks_failed": task.get("static_analysis", {}).get("checks_failed", 0),
    }


@app.get("/api/tasks/<task_id>/stream")
def task_stream(task_id):
    with runtime["lock"]:
        task = runtime["tasks"].get(task_id)
    if task is None:
        for item in load_history():
            if item.get("task_id") == task_id:
                task = item
                break
    if task is None:
        return jsonify({"error": "Task not found"}), 404

    raw_last_id = request.headers.get("Last-Event-ID", "").strip()
    # A cursor is meaningful only for this task; reject IDs from another stream.
    # Bound the numeric suffix before int() so hostile headers cannot trigger
    # Python's large-integer conversion limit or request excessive parsing work.
    match = re.fullmatch(re.escape(task_id) + r"-E([0-9]{1,12})", raw_last_id)
    last_sequence = int(match.group(1)) if match else 0

    @stream_with_context
    def generate():
        sent_state = None
        heartbeat_at = time.monotonic()
        deadline = time.monotonic() + 60
        sequence = last_sequence

        while time.monotonic() < deadline:
            with runtime["lock"]:
                live_task = runtime["tasks"].get(task_id)
            if live_task is None:
                live_task = task

            snapshot = _task_stream_snapshot(live_task)
            signature = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
            if signature != sent_state:
                sent_state = signature
                yield _sse_message("state", snapshot)

            events = live_task.get("events", [])
            for item in events:
                event_match = re.fullmatch(r".*-E(\d+)", str(item.get("event_id", "")))
                event_sequence = int(event_match.group(1)) if event_match else 0
                if event_sequence > sequence:
                    sequence = event_sequence
                    yield _sse_message("trace", item, item.get("event_id"))

            status = live_task.get("status")
            if status in {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}:
                yield _sse_message("close", {"task_id": task_id, "status": status})
                return

            if time.monotonic() - heartbeat_at >= 10:
                heartbeat_at = time.monotonic()
                yield ": cyrus-heartbeat\n\n"
            time.sleep(0.25)

        yield _sse_message("close", {
            "task_id": task_id,
            "status": "STREAM_TIMEOUT",
            "reason": "Event stream lease expired; reconnect with Last-Event-ID to resume."
        })

    response = Response(generate(), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


@app.get("/api/tasks/<task_id>/lineage")
def task_lineage(task_id):
    """Return a bounded, summary-only view of the retry chain containing this task."""
    records = all_task_records()
    by_id = {
        str(item.get("task_id")): item
        for item in records
        if item.get("task_id")
    }
    target = by_id.get(task_id)
    if target is None:
        return jsonify({"error": "Task not found"}), 404

    # Walk to a known ancestor without trusting stored parent pointers to be valid.
    # Older history may have pruned a parent, and malformed records can contain cycles.
    current = task_id
    ancestor_path = []
    visited_ancestors = set()
    while current in by_id and current not in visited_ancestors and len(ancestor_path) < 50:
        visited_ancestors.add(current)
        ancestor_path.append(current)
        parent_id = by_id[current].get("parent_task_id")
        if not isinstance(parent_id, str) or parent_id not in by_id or parent_id in visited_ancestors:
            break
        current = parent_id
    root_id = ancestor_path[-1] if ancestor_path else task_id

    children = {}
    for item in by_id.values():
        child_id = str(item.get("task_id") or "")
        parent_id = item.get("parent_task_id")
        if child_id and isinstance(parent_id, str) and parent_id in by_id:
            children.setdefault(parent_id, []).append(child_id)
    for parent_id, child_ids in children.items():
        child_ids.sort(key=lambda child_id: (
            _retry_attempt_number(by_id[child_id]),
            str(by_id[child_id].get("created_at") or ""),
            child_id,
        ))

    # Breadth-first traversal includes historical sibling attempts if they exist.
    # The cap makes this safe even if history contains a malformed or cyclic graph.
    queue = [root_id]
    visited = set()
    ordered_ids = []
    while queue and len(ordered_ids) < 50:
        current_id = queue.pop(0)
        if current_id in visited or current_id not in by_id:
            continue
        visited.add(current_id)
        ordered_ids.append(current_id)
        queue.extend(child_id for child_id in children.get(current_id, []) if child_id not in visited)

    truncated = bool(queue)
    if task_id not in ordered_ids:
        if len(ordered_ids) >= 50:
            ordered_ids[-1] = task_id
        else:
            ordered_ids.append(task_id)
    attempts = [task_summary(by_id[item_id]) for item_id in ordered_ids if item_id in by_id]
    return jsonify({
        "current_task_id": task_id,
        "root_task_id": root_id,
        "attempt_count": len(attempts),
        "truncated": truncated,
        "attempts": attempts,
    })


@app.get("/api/tasks/<task_id>")
def task_detail(task_id):
    with runtime["lock"]:
        task = runtime["tasks"].get(task_id)
    if task:
        snapshot = dict(task)
        snapshot.setdefault("retry_number", 0)
        snapshot.setdefault("retry_reason", None)
        snapshot.setdefault("max_task_retries", MAX_TASK_RETRIES)
        snapshot["effective_max_task_retries"] = _effective_task_retry_limit(snapshot)
        return jsonify(snapshot)
    for item in load_history():
        if item.get("task_id") == task_id:
            # Older records predate retry metadata; never rewrite the stored snapshot.
            snapshot = dict(item)
            snapshot.setdefault("retry_number", 0)
            snapshot.setdefault("retry_reason", None)
            snapshot.setdefault("max_task_retries", MAX_TASK_RETRIES)
            snapshot["effective_max_task_retries"] = _effective_task_retry_limit(snapshot)
            return jsonify(snapshot)
    return jsonify({"error": "Task not found"}), 404

@app.get("/api/memory")
def memory():
    return jsonify([task_summary(item) for item in load_history()])

@app.post("/api/execute")
def execute():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415
    payload = request.get_json(silent=False)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON body must be an object"}), 400

    raw_prompt = payload.get("prompt", "")
    if not isinstance(raw_prompt, str):
        return jsonify({"error": "Prompt must be a string"}), 400
    raw_mode = payload.get("mode", "autonomous")
    if not isinstance(raw_mode, str):
        return jsonify({"error": "Mode must be a string"}), 400

    prompt = raw_prompt.strip()
    mode = raw_mode.strip().lower()
    if len(prompt) > MAX_PROMPT_CHARS:
        return jsonify({"error": f"Prompt exceeds the {MAX_PROMPT_CHARS}-character limit"}), 413
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    if mode not in {"autonomous", "supervised"}:
        return jsonify({"error": "Mode must be autonomous or supervised"}), 400
    try:
        idempotency_key = normalize_idempotency_key(request.headers.get("Idempotency-Key"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    allowed, retry_after = rate_limit_execution(request.remote_addr)
    if not allowed:
        limited = jsonify({"error": "Execution submission rate limit exceeded", "retry_after_seconds": retry_after})
        limited.headers["Retry-After"] = str(retry_after)
        return limited, 429
    fingerprint = {"prompt": prompt, "mode": mode}
    if idempotency_key:
        with runtime["lock"]:
            existing = runtime["idempotency"].get(idempotency_key)
            if existing:
                if existing["fingerprint"] != fingerprint:
                    return jsonify({"error": "Idempotency-Key was already used for a different objective"}), 409
                existing_task = runtime["tasks"].get(existing["task_id"]) if existing["task_id"] else None
                if existing_task:
                    return jsonify({
                        "task_id": existing_task["task_id"],
                        "status": existing_task["status"],
                        "summary": "Existing execution returned for duplicate request.",
                        "mode": existing_task["mode"],
                        "agents": existing_task["agents"],
                        "deduplicated": True
                    }), 200
                history_task = find_history_by_idempotency(idempotency_key)
                if history_task:
                    return jsonify({
                        "task_id": history_task["task_id"],
                        "status": history_task["status"],
                        "summary": "Existing persisted execution returned for duplicate request.",
                        "mode": history_task["mode"],
                        "agents": history_task.get("agents", []),
                        "deduplicated": True
                    }), 200
                return jsonify({"error": "Execution with this Idempotency-Key is already being created"}), 409
            history_task = find_history_by_idempotency(idempotency_key)
            if history_task:
                historical_fingerprint = {
                    "prompt": history_task.get("objective", ""),
                    "mode": history_task.get("mode", "autonomous"),
                }
                if historical_fingerprint != fingerprint:
                    return jsonify({"error": "Idempotency-Key was already used for a different objective"}), 409
                runtime["idempotency"][idempotency_key] = {
                    "fingerprint": fingerprint,
                    "task_id": history_task["task_id"]
                }
                return jsonify({
                    "task_id": history_task["task_id"],
                    "status": history_task.get("status", "COMPLETED"),
                    "summary": "Existing persisted execution returned for duplicate request.",
                    "mode": history_task.get("mode", "autonomous"),
                    "agents": history_task.get("agents", []),
                    "deduplicated": True
                }), 200
            runtime["idempotency"][idempotency_key] = {"fingerprint": fingerprint, "task_id": None}
    try:
        task = create_task(prompt, mode, idempotency_key=idempotency_key)
        if idempotency_key:
            with runtime["lock"]:
                runtime["idempotency"][idempotency_key]["task_id"] = task["task_id"]
    except CapacityError as exc:
        if idempotency_key:
            with runtime["lock"]:
                runtime["idempotency"].pop(idempotency_key, None)
        return jsonify({"error": str(exc)}), 429
    except Exception:
        if idempotency_key:
            with runtime["lock"]:
                runtime["idempotency"].pop(idempotency_key, None)
        raise
    return jsonify({
        "task_id": task["task_id"],
        "status": task["status"],
        "summary": "Execution accepted by CYRUS runtime.",
        "mode": mode,
        "agents": task["agents"]
    }), 202

@app.errorhandler(413)
def handle_payload_too_large(error):
    return jsonify({
        "error": "Request body exceeds the configured size limit",
        "request_id": getattr(g, "request_id", "-")
    }), 413

@app.errorhandler(Exception)
def handle_error(error):
    if isinstance(error, HTTPException):
        return jsonify({
            "error": error.description,
            "request_id": getattr(g, "request_id", "-")
        }), error.code
    app.logger.exception("Unhandled CYRUS runtime error", extra={"request_id": getattr(g, "request_id", "-")})
    return jsonify({"error": "CYRUS runtime error", "request_id": getattr(g, "request_id", "-")}), 500

if __name__ == "__main__":
    host = os.getenv("CYRUS_HOST", "127.0.0.1")
    port = int(os.getenv("CYRUS_PORT", "8000"))
    debug = os.getenv("CYRUS_DEBUG", "0").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug)
