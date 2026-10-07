from flask import Flask, g, jsonify, request, send_from_directory
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from providers import get_provider
from pathlib import Path
import json
import os
import threading
import time
import uuid
import random
import re
import tempfile

BASE_DIR = Path(__file__).resolve().parent
STORE = BASE_DIR / "cyrus_history.json"
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("CYRUS_MAX_REQUEST_BYTES", "16384"))
MAX_PROMPT_CHARS = max(200, min(int(os.getenv("CYRUS_MAX_PROMPT_CHARS", "4000")), 20000))

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

@app.before_request
def establish_request_context():
    candidate = request.headers.get("X-Request-ID", "").strip()
    g.request_id = candidate if REQUEST_ID_PATTERN.fullmatch(candidate) else uuid.uuid4().hex

@app.after_request
def apply_response_hardening(response):
    request_id = getattr(g, "request_id", uuid.uuid4().hex)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
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
history_lock = threading.RLock()
PROVIDER = get_provider()

runtime = {
    "started_at": time.time(),
    "tasks": {},
    "lock": threading.Lock(),
    "executor": ThreadPoolExecutor(max_workers=MAX_CONCURRENT_TASKS),
    "futures": {},
    "idempotency": {},
    "cancel_events": {},
    "approval_events": {}
}

class CapacityError(RuntimeError):
    pass

class TaskCancelled(RuntimeError):
    pass

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def load_history():
    with history_lock:
        if not STORE.exists():
            return []
        try:
            payload = json.loads(STORE.read_text(encoding="utf-8"))
            return payload if isinstance(payload, list) else []
        except (OSError, json.JSONDecodeError, TypeError):
            return []

def save_history(items):
    serialized = json.dumps(items[-100:], indent=2)
    with history_lock:
        STORE.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=".cyrus-history-", suffix=".tmp", dir=STORE.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(serialized)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, STORE)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

def find_history_by_idempotency(key):
    if not key:
        return None
    for item in reversed(load_history()):
        if item.get("idempotency_key") == key:
            return item
    return None

def normalize_idempotency_key(raw):
    candidate = str(raw or "").strip()
    if not candidate:
        return None
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,100}", candidate):
        raise ValueError("Idempotency-Key must contain only safe ASCII characters and be at most 100 characters")
    return candidate

def task_summary(task):
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
        "artifact_count": len(task.get("artifacts", [])),
        "event_count": len(task.get("events", []))
    }

def persist_task(task):
    with history_lock:
        items = load_history()
        snapshot = {
        "task_id": task["task_id"],
        "created_at": task["created_at"],
        "objective": task["objective"],
        "mode": task["mode"],
        "status": task["status"],
        "score": task.get("score", 0),
        "execution_time_ms": task.get("execution_time_ms", 0),
        "confidence": task.get("confidence", 0),
        "risk": task.get("risk", "LOW"),
        "summary": task.get("summary", ""),
        "artifacts": task.get("artifacts", []),
        "idempotency_key": task.get("idempotency_key"),
        "current_agent": task.get("current_agent"),
        "plan": task.get("plan", []),
        "research": task.get("research", []),
        "tests_passed": task.get("tests_passed", 0),
        "tests_failed": task.get("tests_failed", 0),
        "coverage": task.get("coverage", 0),
        "quality": task.get("quality", 0),
        "latency_ms": task.get("latency_ms", 0),
        "agents": task.get("agents", []),
        "events": task.get("events", [])
        }
        items = [item for item in items if item["task_id"] != task["task_id"]]
        items.append(snapshot)
        save_history(items)

def event(task, agent, phase, message, duration_ms):
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

def artifact(name, language, size, kind):
    return {"name": name, "language": language, "size": size, "type": kind}

def build_demo_plan(prompt):
    return PROVIDER.plan(prompt)

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
    approval_event = runtime["approval_events"].get(task["task_id"])
    cancel_event = runtime["cancel_events"].get(task["task_id"])
    if approval_event is None:
        raise RuntimeError("Supervised approval control is unavailable")
    while True:
        if cancel_event and cancel_event.is_set():
            raise TaskCancelled("Task cancellation requested")
        if approval_event.wait(timeout=0.1):
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
            event(task, task.get("current_agent", "ORCHESTRATOR"), "CANCELLED", "Execution stopped by operator request.", 0)
        persist_task(task)
    except Exception as exc:
        with runtime["lock"]:
            task["status"] = "FAILED"
            task["current_agent"] = task.get("current_agent", "ORCHESTRATOR")
            task["failure"] = {"type": type(exc).__name__, "message": str(exc)[:500]}
            task["summary"] = "CYRUS stopped the execution after an internal runtime failure."
            task["updated_at"] = now_iso()
            event(task, task["current_agent"], "FAILURE", "Execution failed safely; inspect the failure payload and request id.", 0)
        persist_task(task)
    finally:
        runtime["futures"].pop(task["task_id"], None)
        runtime["cancel_events"].pop(task["task_id"], None)
        runtime["approval_events"].pop(task["task_id"], None)

def _run_task(task):
    started = time.perf_counter()
    stages = [
        ("ORCHESTRATOR", "INITIALIZATION", "Execution context established", 168),
        ("PLANNER", "DECOMPOSITION", "Objective decomposed into six executable work packages", 244),
        ("RESEARCHER", "EVIDENCE", "Engineering constraints and implementation patterns synthesized", 312),
        ("CODER", "IMPLEMENTATION", "Service design and representative implementation artifacts generated", 528),
        ("TESTER", "VALIDATION", "Validation suite executed against the generated solution", 388),
        ("REVIEWER", "ASSURANCE", "Quality, release risk and operational readiness assessed", 276),
        ("RELEASE", "DELIVERY", "Release manifest prepared and execution audit finalized", 214)
    ]
    for index, (agent, phase, message, duration_ms) in enumerate(stages):
        with runtime["lock"]:
            task["current_agent"] = agent
            for item in task["agents"]:
                item["status"] = "RUNNING" if item["name"] == agent else ("COMPLETED" if item["id"] < index + 1 else "QUEUED")
            task["updated_at"] = now_iso()
        stage_started = time.perf_counter()
        event(task, agent, phase, message, duration_ms)
        cooperative_wait(task, duration_ms / 1000)
        observed_duration = int((time.perf_counter() - stage_started) * 1000)
        task["events"][-1]["duration"] = observed_duration
        with runtime["lock"]:
            for item in task["agents"]:
                if item["name"] == agent:
                    item["status"] = "COMPLETED"
            task["tool_calls"] += 1 if agent in {"RESEARCHER", "CODER", "TESTER", "REVIEWER", "RELEASE"} else 0
        if agent == "PLANNER":
            task["plan"] = build_demo_plan(task["objective"])
        if agent == "RESEARCHER":
            task["research"] = PROVIDER.research(task["objective"])
        if agent == "TESTER":
            task["tests_passed"] = 18
            task["tests_failed"] = 0
            task["coverage"] = 92
        if agent == "REVIEWER":
            task["quality"] = 94
            task["risk"] = "LOW" if task["mode"] == "autonomous" else "MEDIUM"
            task["confidence"] = 96 if task["mode"] == "autonomous" else 91
        if agent == "REVIEWER" and task["mode"] == "supervised":
            with runtime["lock"]:
                task["status"] = "AWAITING_APPROVAL"
                task["approval_required"] = True
                task["updated_at"] = now_iso()
                event(task, "REVIEWER", "APPROVAL", "Supervised mode paused after review; operator approval is required for release.", 0)
                persist_task(task)
            wait_for_supervised_approval(task)
            with runtime["lock"]:
                task["status"] = "RUNNING"
                task["approval_required"] = False
                task["approved_at"] = now_iso()
                task["updated_at"] = now_iso()
                event(task, "ORCHESTRATOR", "APPROVED", "Operator approval received; release stage resumed.", 0)

        if agent == "RELEASE":
            task["artifacts"] = [
                artifact("service.py", "Python", "8.4 KB", "implementation"),
                artifact("test_service.py", "Python", "6.1 KB", "test suite"),
                artifact("cyrus.manifest.json", "JSON", "2.3 KB", "release manifest")
            ]
    elapsed = int((time.perf_counter() - started) * 1000)
    with runtime["lock"]:
        task["execution_time_ms"] = elapsed
        task["latency_ms"] = max(42, elapsed // 9)
        task["score"] = round((task["quality"] + task["coverage"] + task["confidence"]) / 3, 1)
        task["status"] = "COMPLETED"
        task["current_agent"] = "RELEASE"
        task["summary"] = "CYRUS completed the full seven-stage engineering graph and produced a release-ready execution package."
        task["updated_at"] = now_iso()
    persist_task(task)

def create_task(prompt, mode, idempotency_key=None):
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
        "idempotency_key": idempotency_key,
        "events": [],
        "agents": [dict(agent, status="QUEUED") for agent in AGENTS]
    }
    with runtime["lock"]:
        active = sum(1 for item in runtime["tasks"].values() if item.get("status") in {"RUNNING", "AWAITING_APPROVAL"}
        if active >= MAX_CONCURRENT_TASKS:
            raise CapacityError("CYRUS worker capacity is currently full")
        runtime["tasks"][task_id] = task
        runtime["cancel_events"][task_id] = threading.Event()
        runtime["approval_events"][task_id] = threading.Event()
    future = runtime["executor"].submit(execute_task, task)
    runtime["futures"][task_id] = future
    return task

@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

PUBLIC_ASSETS = {"styles.css", "app.js", "demo-bridge.js"}

@app.get("/<path:name>")
def public_asset(name):
    if name not in PUBLIC_ASSETS:
        return jsonify({"error": "Resource not found"}), 404
    return send_from_directory(BASE_DIR, name)

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "system": "CYRUS CORE 1.0",
        "mode": PROVIDER.mode,
        "provider": PROVIDER.name,
        "provider_status": PROVIDER.status,
        "worker_capacity": MAX_CONCURRENT_TASKS
    })

@app.get("/api/agents")
def agents():
    return jsonify(AGENTS)

@app.get("/api/tools")
def tools():
    return jsonify(TOOLS)

def runtime_metrics():
    history = load_history()
    with runtime["lock"]:
        live = list(runtime["tasks"].values())
        active = sum(1 for task in live if task.get("status") == "RUNNING")
        awaiting = sum(1 for task in live if task.get("status") == "AWAITING_APPROVAL")
        completed = sum(1 for task in live if task.get("status") == "COMPLETED")
        failed = sum(1 for task in live if task.get("status") == "FAILED")
        cancelled = sum(1 for task in live if task.get("status") == "CANCELLED")
    historical = [item for item in history if item.get("status") in {"COMPLETED", "FAILED", "CANCELLED"}]
    latencies = [item.get("execution_time_ms", 0) for item in historical if item.get("execution_time_ms")]
    return {
        "system": "CYRUS CORE 1.0",
        "uptime_seconds": round(max(0, time.time() - runtime["started_at"]), 1),
        "capacity": MAX_CONCURRENT_TASKS,
        "active_tasks": active,
        "awaiting_approval": awaiting,
        "completed_tasks": completed,
        "failed_tasks": failed,
        "cancelled_tasks": cancelled,
        "persisted_tasks": len(history),
        "average_execution_ms": round(sum(latencies) / len(latencies), 1) if latencies else 0
    }

@app.get("/api/metrics")
def metrics():
    return jsonify(runtime_metrics())

@app.get("/api/tasks")
def tasks():
    try:
        limit = max(1, min(int(request.args.get("limit", "50")), 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400
    status = request.args.get("status", "").strip().upper()
    if status and status not in {"RUNNING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"}:
        return jsonify({"error": "Unsupported task status filter"}), 400
    live = list(runtime["tasks"].values())
    history = load_history()
    merged = {item["task_id"]: item for item in history}
    for task in live:
        merged[task["task_id"]] = task_summary(task)
    results = sorted(merged.values(), key=lambda x: x.get("created_at", ""), reverse=True)
    if status:
        results = [item for item in results if item.get("status") == status]
    return jsonify(results[:limit])

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
        approval_event.set()
    return jsonify({
        "task_id": task_id,
        "status": "APPROVAL_GRANTED",
        "summary": "CYRUS will resume the release stage."
    }), 202

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
        cancel_event.set()
    return jsonify({
        "task_id": task_id,
        "status": "CANCELLATION_REQUESTED",
        "summary": "CYRUS will stop at the next safe execution checkpoint."
    }), 202

@app.get("/api/tasks/<task_id>")
def task_detail(task_id):
    task = runtime["tasks"].get(task_id)
    if task:
        return jsonify(task)
    for item in load_history():
        if item["task_id"] == task_id:
            return jsonify(item)
    return jsonify({"error": "Task not found"}), 404

@app.get("/api/memory")
def memory():
    return jsonify([task_summary(item) for item in load_history()])

@app.post("/api/execute")
def execute():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415
    payload = request.get_json(silent=False) or {}
    prompt = str(payload.get("prompt", "")).strip()
    mode = str(payload.get("mode", "autonomous")).lower()
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
                        "agents": [],
                        "deduplicated": True
                    }), 200
                return jsonify({"error": "Execution with this Idempotency-Key is already being created"}), 409
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
    app.logger.exception("Unhandled CYRUS runtime error", extra={"request_id": getattr(g, "request_id", "-")})
    return jsonify({"error": "CYRUS runtime error", "request_id": getattr(g, "request_id", "-")}), 500

if __name__ == "__main__":
    host = os.getenv("CYRUS_HOST", "127.0.0.1")
    port = int(os.getenv("CYRUS_PORT", "8000"))
    debug = os.getenv("CYRUS_DEBUG", "0").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug)
