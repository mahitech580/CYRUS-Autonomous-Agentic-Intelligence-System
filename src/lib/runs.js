const CSV_COLUMNS = [
  "id", "goal", "status", "progress", "created_at", "updated_at",
  "execution_mode", "current_stage", "approval_status",
];

export function filterRuns(runs, query = "", statusFilter = "all") {
  const items = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const needle = String(query || "").trim().toLowerCase();
  return items.filter((run) => {
    const matchesSearch = !needle || [
      run.id, run.goal, run.status, run.kind, run.current_stage,
      run.approval_status, run.execution_mode, run.error,
    ].some((item) => String(item || "").toLowerCase().includes(needle));
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "completed"
        ? ["completed", "review", "approved"].includes(run.status) && Number(run.progress) >= 100
        : run.status === statusFilter);
    return matchesSearch && matchesStatus;
  });
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Spreadsheet applications may evaluate untrusted cells beginning with a
  // formula marker, even when the field is correctly CSV-quoted.
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""').replace(/\r\n?|\n/g, " ") + '"';
}

export function buildRunsCsv(runs) {
  const items = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const lines = [
    CSV_COLUMNS.join(","),
    ...items.map((run) => CSV_COLUMNS.map((key) => csvCell(run[key])).join(",")),
  ];
  // UTF-8 BOM helps spreadsheet apps recognize UTF-8. CRLF is broadly supported.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function mapRunRecord(run) {
  const dateValue = run?.updated_at || run?.created_at;
  let time = "Just now";
  if (dateValue) {
    try {
      const parsed = new Date(dateValue);
      time = Number.isNaN(parsed.getTime()) ? String(dateValue) : parsed.toLocaleString();
    } catch {
      time = String(dateValue);
    }
  }
  return {
    ...run,
    time,
    agents: Number.isFinite(Number(run?.agent_count)) && run?.agent_count != null
      ? Math.max(0, Math.floor(Number(run.agent_count)))
      : 7,
    kind: run?.execution_mode === "live-model"
      ? "Live AI workflow"
      : run?.execution_mode || "Workflow",
  };
}

/**
 * Merge incremental event pages without replaying duplicate IDs. The backend
 * retains a bounded event window, so callers may request a full reset.
 */
export function mergeRunEvents(existing, incoming, replace = false) {
  const merged = new Map();
  const base = replace ? [] : (Array.isArray(existing) ? existing : []);
  const additions = Array.isArray(incoming) ? incoming : [];
  for (const event of [...base, ...additions]) {
    if (event && typeof event.id === "string" && event.id) merged.set(event.id, event);
  }
  return [...merged.values()].slice(-250);
}

 
/** Summary-safe check for saved artifacts; list responses intentionally omit payloads. */
export function hasRunArtifacts(run) {
  if (run?.stage_count != null) {
    const count = Number(run.stage_count);
    if (Number.isFinite(count)) return count > 0;
  }
  return Array.isArray(run?.stages) && run.stages.length > 0;
}


/** Keep a stable retry key per failed source run until the server acknowledges it. */
export function getOrCreateRetryRequestKey(holder, runId, createKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "cyrus-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}) {
  const sourceId = String(runId || "").trim();
  if (!holder || typeof holder !== "object" || !sourceId) {
    throw new TypeError("A request-key holder and source run ID are required.");
  }
  if (!(holder.current instanceof Map)) holder.current = new Map();
  if (!holder.current.has(sourceId)) holder.current.set(sourceId, createKey());
  return holder.current.get(sourceId);
}


/** Exponential retry delay for transient run-poll failures, capped at 30 seconds. */
export function nextRunPollDelay(failures) {
  const count = Number.isFinite(Number(failures))
    ? Math.max(0, Math.min(5, Math.floor(Number(failures))))
    : 0;
  return Math.min(2500 * (2 ** count), 30000);
}

/** Keep successful status and event responses independent during polling. */
export function settleRunPoll(statusResult, eventResult) {
  const statusOk = statusResult?.status === "fulfilled" && !!statusResult.value?.item;
  const eventsOk = eventResult?.status === "fulfilled";
  return {
    status: statusOk ? statusResult.value.item : null,
    events: eventsOk ? eventResult.value : null,
    statusOk,
    eventsOk,
  };
}

/** Whether the lightweight status response signals new artifact payloads. */
export function needsRunDetailRefresh(serverStageCount, loadedStageCount) {
  const serverCount = Number(serverStageCount);
  const loadedCount = Number(loadedStageCount);
  return Number.isFinite(serverCount)
    && serverCount > Math.max(0, Number.isFinite(loadedCount) ? loadedCount : 0);
}

/** Keep one creation key for the same goal until the server acknowledges it. */
export function getOrCreateRunRequestKey(holder, goal, createKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "cyrus-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}) {
  const cleanGoal = String(goal || "").trim();
  if (!holder || typeof holder !== "object") {
    throw new TypeError("A mutable request-key holder is required.");
  }
  if (!holder.current || holder.current.goal !== cleanGoal) {
    holder.current = { goal: cleanGoal, key: createKey() };
  }
  return holder.current.key;
}


/** Advance history pagination without treating a null terminal cursor as zero. */
export function getRunPageOffset(response, currentOffset = 0, pageLength = 0) {
  const nextOffset = response?.next_offset;
  const parsedNext = Number(nextOffset);
  if (nextOffset != null && Number.isFinite(parsedNext) && parsedNext >= 0) {
    return Math.floor(parsedNext);
  }
  const offset = Number(currentOffset);
  const count = Number(pageLength);
  return Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0))
    + Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
}


/** Resolve each pipeline stage from persisted artifacts, the active stage, and failure events. */
export function getRunStageState(run, stageId) {
  const stages = Array.isArray(run?.stages) ? run.stages : [];
  if (stages.some((stage) => stage?.id === stageId)) return "completed";
  const events = Array.isArray(run?.events) ? run.events : [];
  const failed = events.some((event) => event?.status === "failed" && event?.stage === stageId);
  if (failed) return "failed";
  if (run?.current_stage === stageId && ["queued", "running"].includes(run?.status)) return "active";
  return "queued";
}



/** Derive stage elapsed time from persisted start and terminal events. */
export function getRunStageTiming(run, stageId, now = Date.now()) {
  const events = Array.isArray(run?.events) ? run.events : [];
  let startedAt = null;
  let endedAt = null;
  let terminalStatus = null;
  for (const event of events) {
    if (event?.stage !== stageId) continue;
    const timestamp = Date.parse(event.at);
    if (!Number.isFinite(timestamp)) continue;
    if (event.status === "started") {
      startedAt = timestamp;
      endedAt = null;
      terminalStatus = null;
      continue;
    }
    if (startedAt !== null && timestamp >= startedAt && ["completed", "failed"].includes(event.status)) {
      endedAt = timestamp;
      terminalStatus = event.status;
    }
  }
  if (startedAt === null) return null;
  if (endedAt === null && ["failed", "cancelled"].includes(run?.status)) {
    const updatedAt = Date.parse(run?.updated_at);
    if (Number.isFinite(updatedAt) && updatedAt >= startedAt) {
      endedAt = updatedAt;
      terminalStatus = "interrupted";
    }
  }
  const fallbackNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const end = endedAt ?? fallbackNow;
  return {
    status: terminalStatus || "running",
    durationMs: Math.max(0, end - startedAt),
  };
}

/** Put a newly accepted workflow first without duplicating an idempotent replay. */
export function prependRunRecord(items, incoming) {
  const current = Array.isArray(items) ? items : [];
  if (!incoming || typeof incoming !== "object" || !incoming.id) return current;
  return [incoming, ...current.filter((run) => run?.id !== incoming.id)];
}
