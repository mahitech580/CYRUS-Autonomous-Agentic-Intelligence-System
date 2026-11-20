const CSV_COLUMNS = [
  "id", "goal", "status", "progress", "created_at", "updated_at",
  "execution_mode", "current_stage", "approval_status",
];

function normalizeRunSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/([A-Za-z])\p{M}+/gu, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

function isRunEvent(event) {
  return !!event && typeof event === "object" && !Array.isArray(event);
}

function getRunEventStatus(event) {
  return String(event?.status || "info").trim().toLowerCase() || "info";
}

/** Return only statuses present in the loaded event window. */
export function getRunEventStatuses(events) {
  const statuses = new Set();
  if (!Array.isArray(events)) return [];
  for (const event of events) {
    if (isRunEvent(event)) statuses.add(getRunEventStatus(event));
  }
  return [...statuses].sort();
}

/**
 * Filter only the event records currently loaded for a run. All query terms
 * must match across the event's ID, timestamp, stage, agent, status or message.
 */
export function filterRunEvents(events, query = "", statusFilter = "all") {
  const items = Array.isArray(events) ? events.filter(isRunEvent) : [];
  const terms = normalizeRunSearchValue(query).split(/\s+/).filter(Boolean);
  const selectedStatus = String(statusFilter ?? "all").trim().toLowerCase() || "all";

  return items.filter((event) => {
    const eventStatus = getRunEventStatus(event);
    if (selectedStatus !== "all" && eventStatus !== selectedStatus) return false;
    const searchable = normalizeRunSearchValue([
      event.id, event.at, event.stage, event.agent, eventStatus, event.message,
    ].filter((value) => typeof value === "string" || typeof value === "number").join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}

export function isRunCompleted(run) {
  if (!run || typeof run !== "object") return false;
  const progress = Number(run.progress);
  return ["completed", "review", "approved"].includes(run.status)
    && Number.isFinite(progress)
    && progress >= 100;
}

export function filterRuns(runs, query = "", statusFilter = "all") {
  const items = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const terms = normalizeRunSearchValue(query).split(/\s+/).filter(Boolean);
  return items.filter((run) => {
    const stageSearch = Array.isArray(run.stages)
      ? run.stages.flatMap((stage) => stage && typeof stage === "object" ? [
        stage.id, stage.agent, stage.role, stage.status, stage.summary,
      ] : [])
      : [];
    const eventSearch = Array.isArray(run.events)
      ? run.events.flatMap((event) => event && typeof event === "object" ? [
        event.stage, event.agent, event.status, event.message,
      ] : [])
      : [];
    const searchable = normalizeRunSearchValue([
      run.id, run.goal, run.status, run.kind, run.current_stage,
      run.approval_status, run.execution_mode, run.error,
      ...stageSearch, ...eventSearch,
    ].filter((value) => typeof value === "string" || typeof value === "number").join(" "));
    const matchesSearch = !terms.length || terms.every((term) => searchable.includes(term));
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "completed" ? isRunCompleted(run) : run.status === statusFilter);
    return matchesSearch && matchesStatus;
  });
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Spreadsheet applications may evaluate untrusted cells beginning with a
  // formula marker, even when the field is correctly CSV-quoted.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
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

/** Advance a polling cursor, clearing it when an expired empty window has no replacement ID. */
export function getNextRunEventCursor(eventResponse, previousCursor = "") {
  const previous = typeof previousCursor === "string" ? previousCursor : "";
  if (eventResponse?.cursor_expired === true
    && Array.isArray(eventResponse.items)
    && eventResponse.items.length === 0) {
    return "";
  }
  return typeof eventResponse?.next_after === "string" && eventResponse.next_after
    ? eventResponse.next_after
    : previous;
}

/** Apply a poll cursor update; an empty string is an intentional reset, not a missing value. */
export function applyRunEventCursor(currentCursor, nextCursor) {
  if (typeof nextCursor === "string") return nextCursor;
  return typeof currentCursor === "string" ? currentCursor : "";
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
export function mergeRunPollResult(current, poll, detailItem = null) {
  if (!current || typeof current !== "object" || !poll) return null;

  // A successful HTTP response is not enough: never let a mismatched run ID
  // replace the selected record or attach another run's saved artifacts.
  const status = poll.statusOk && poll.status?.id === current.id ? poll.status : null;
  const eventPayload = poll.eventsOk ? poll.events : null;
  const detailStages = detailItem?.id === current.id && Array.isArray(detailItem.stages)
    ? detailItem.stages
    : null;
  if (!status && !eventPayload) return null;

  return {
    ...current,
    ...(status || {}),
    ...(detailStages ? { stages: detailStages } : {}),
    ...(eventPayload
      ? {
          events: mergeRunEvents(
            current.events,
            eventPayload.items,
            eventPayload.cursor_expired === true,
          ),
        }
      : {}),
  };
}

export function settleRunPoll(statusResult, eventResult, expectedRunId = null) {
  const statusItem = statusResult?.value?.item;
  const expectedId = typeof expectedRunId === "string" ? expectedRunId : null;
  const statusOk = statusResult?.status === "fulfilled"
    && !!statusItem
    && typeof statusItem === "object"
    && !Array.isArray(statusItem)
    && typeof statusItem.id === "string"
    && !!statusItem.id
    && (expectedId === null || statusItem.id === expectedId)
    && typeof statusItem.status === "string"
    && !!statusItem.status;

  const eventPayload = eventResult?.value;
  const eventItems = Array.isArray(eventPayload?.items) ? eventPayload.items : null;
  const eventItemsValid = !!eventItems && eventItems.every((event) => (
    isRunEvent(event) && typeof event.id === "string" && !!event.id.trim()
  ));
  const cursorMatchesItems = eventItemsValid && (
    eventItems.length === 0
      ? eventPayload.cursor_expired !== true || eventPayload.next_after == null
      : typeof eventPayload.next_after === "string"
        && eventPayload.next_after === eventItems[eventItems.length - 1].id
  );
  const eventsOk = eventResult?.status === "fulfilled"
    && !!eventPayload
    && typeof eventPayload === "object"
    && !Array.isArray(eventPayload)
    && eventItemsValid
    && cursorMatchesItems
    && (eventPayload.next_after == null || typeof eventPayload.next_after === "string")
    && (eventPayload.cursor_expired == null || typeof eventPayload.cursor_expired === "boolean");

  return {
    status: statusOk ? statusItem : null,
    events: eventsOk ? eventPayload : null,
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

  // Keep recent goals separate so editing away and back after an ambiguous
  // network failure reuses the original key instead of creating a duplicate.
  if (!(holder.current instanceof Map)) {
    const previous = holder.current;
    holder.current = new Map(
      previous?.goal && previous?.key ? [[previous.goal, previous.key]] : []
    );
  }
  const keys = holder.current;
  if (keys.has(cleanGoal)) {
    const existing = keys.get(cleanGoal);
    keys.delete(cleanGoal);
    keys.set(cleanGoal, existing);
    return existing;
  }

  const key = createKey();
  keys.set(cleanGoal, key);
  while (keys.size > 16) keys.delete(keys.keys().next().value);
  return key;
}


/** Advance history pagination without treating a null terminal cursor as zero. */
export function getRunPageOffset(response, currentOffset = 0, pageLength = 0) {
  const offset = Math.max(0, Math.floor(Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0));
  const count = Math.max(0, Math.floor(Number.isFinite(Number(pageLength)) ? Number(pageLength) : 0));
  const minimumNextOffset = offset + count;
  const nextOffset = response?.next_offset;
  const parsedNext = Number(nextOffset);
  // The API advances by exactly the number of returned rows. Reject stale,
  // fractional, or forward-skipping cursors so history pages cannot be skipped.
  if (nextOffset != null && Number.isSafeInteger(parsedNext) && parsedNext === minimumNextOffset) {
    return parsedNext;
  }
  return minimumNextOffset;
}


/** Resolve each pipeline stage from persisted artifacts, the active stage, and failure events. */
export function getRunStageState(run, stageId) {
  const stages = Array.isArray(run?.stages) ? run.stages : [];
  const persisted = stages.find((stage) => stage?.id === stageId);
  const runStatus = String(run?.status || "").trim().toLowerCase();
  if (persisted) {
    const status = String(persisted.status || "").trim().toLowerCase();
    if (["failed", "error"].includes(status)) return "failed";
    if (["interrupted", "cancelled", "stopped"].includes(status)) return "interrupted";
    if (["running", "started"].includes(status)) return runStatus === "running" ? "active" : "interrupted";
    if (["queued", "pending"].includes(status)) return "queued";
    // Older records did not persist a stage status; their artifact presence
    // remains the compatibility signal for a completed stage.
    if (!status || ["completed", "success"].includes(status)) return "completed";
    // Unknown future states must not be presented as successful artifacts.
    return "queued";
  }
  const events = Array.isArray(run?.events) ? run.events : [];
  const stageEvents = events.filter((event) => event?.stage === stageId);
  if (stageEvents.some((event) => event?.status === "failed")) return "failed";
  if (stageEvents.some((event) => event?.status === "completed")) return "completed";
  const started = stageEvents.some((event) => event?.status === "started");
  if (started && runStatus !== "running") return "interrupted";
  if (run?.current_stage === stageId && runStatus === "running") return "active";
  return "queued";
}




/** Count completed pipeline stages using the same state rules as the timeline. */
export function countCompletedRunStages(run, stageIds = []) {
  const ids = Array.isArray(stageIds) ? stageIds : [];
  return ids.reduce((count, stageId) => (
    count + (getRunStageState(run, stageId) === "completed" ? 1 : 0)
  ), 0);
}

/** Derive stage elapsed time from persisted start and terminal events. */
export function getRunStageTiming(run, stageId, now = Date.now()) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const stages = Array.isArray(run?.stages) ? run.stages : [];
  const persistedStage = stages.find((stage) => stage?.id === stageId);
  const persistedStatus = String(persistedStage?.status || "").trim().toLowerCase();
  const runStatus = String(run?.status || "").trim().toLowerCase();
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
  if (endedAt === null && persistedStage?.completed_at) {
    const completedAt = Date.parse(persistedStage.completed_at);
    if (Number.isFinite(completedAt) && completedAt >= startedAt) {
      endedAt = completedAt;
      terminalStatus = "completed";
    }
  }
  if (endedAt === null && runStatus !== "running") {
    const updatedAt = Date.parse(run?.updated_at);
    if (Number.isFinite(updatedAt) && updatedAt >= startedAt) {
      endedAt = updatedAt;
      terminalStatus = ["failed", "error"].includes(persistedStatus) ? "failed" : "interrupted";
    }
  }
  // A legacy artifact may prove completion without carrying a trustworthy
  // completion timestamp. Do not invent a duration from the whole run's update time.
  if (endedAt === null && persistedStage && (!persistedStatus || ["completed", "success"].includes(persistedStatus))) {
    return null;
  }
  const fallbackNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const end = endedAt ?? fallbackNow;
  return {
    status: terminalStatus || "running",
    durationMs: Math.max(0, end - startedAt),
  };
}

/** Match the API's required goal length before sending a request. */
export function validateRunGoal(value) {
  const raw = String(value ?? "");
  const clean = raw.trim();
  if (!clean) return "Describe the engineering outcome before starting a workflow.";
  const characterCount = [...clean].length;
  if (characterCount < 8) return "Describe the engineering outcome in at least 8 characters.";
  if ([...raw].length > 1200) return "Keep the workflow goal to 1,200 characters or fewer.";
  return "";
}

/**
 * Refresh list metadata without discarding detail already loaded into an open drawer.
 * The API list endpoint intentionally omits stage artifacts and event payloads.
 */
export function mergeRunSummaryIntoDetail(current, summary) {
  if (!current || typeof current !== "object") return summary || current;
  if (!summary || typeof summary !== "object" || summary.id !== current.id) return current;
  return {
    ...current,
    ...summary,
    stages: Array.isArray(current.stages) ? current.stages : [],
    events: Array.isArray(current.events) ? current.events : [],
    detail_loading: !!current.detail_loading,
  };
}

/** Put a newly accepted workflow first without duplicating an idempotent replay. */
/** Aggregate only finite, non-negative token counts from run details already loaded in memory. */
export function summarizeRunUsage(runs) {
  const items = Array.isArray(runs) ? runs.filter((run) => run && typeof run === "object") : [];
  const detailedRuns = items.filter((run) => Array.isArray(run.stages) && run.stages.length > 0);
  let inputTokens = 0;
  let outputTokens = 0;
  let stageUsageCount = 0;
  let hasUsage = false;

  for (const run of detailedRuns) {
    for (const stage of run.stages) {
      const usage = stage?.usage;
      if (!usage || typeof usage !== "object") continue;
      let stageHasUsage = false;
      const input = usage.input_tokens == null ? null : Number(usage.input_tokens);
      const output = usage.output_tokens == null ? null : Number(usage.output_tokens);
      if (input !== null && Number.isFinite(input) && input >= 0) {
        inputTokens += Math.floor(input);
        stageHasUsage = true;
      }
      if (output !== null && Number.isFinite(output) && output >= 0) {
        outputTokens += Math.floor(output);
        stageHasUsage = true;
      }
      if (stageHasUsage) {
        stageUsageCount += 1;
        hasUsage = true;
      }
    }
  }

  return { inputTokens, outputTokens, detailedRunCount: detailedRuns.length, stageUsageCount, hasUsage };
}


export function prependRunRecord(items, incoming) {
  const current = Array.isArray(items) ? items : [];
  if (!incoming || typeof incoming !== "object" || !incoming.id) return current;
  return [incoming, ...current.filter((run) => run?.id !== incoming.id)];
}

/**
 * Keep local history pagination and server totals correct when a request is
 * replayed after an ambiguous network failure.
 */
export function getRunInsertionChanges(items, incoming, replayed = false) {
  const current = Array.isArray(items) ? items : [];
  const validIncoming = !!incoming && typeof incoming === "object" && !!incoming.id;
  const alreadyLoaded = validIncoming && current.some((run) => run?.id === incoming.id);
  const inserted = validIncoming && !alreadyLoaded;
  return {
    items: prependRunRecord(current, incoming),
    offsetDelta: inserted ? 1 : 0,
    totalDelta: inserted && replayed !== true ? 1 : 0,
  };
}

/** Refresh server aggregates when a queued/running workflow reaches a terminal state. */
export function shouldRefreshRunAggregates(previousStatus, nextStatus) {
  const activeStatuses = new Set(["queued", "running"]);
  const previous = String(previousStatus || "").trim().toLowerCase();
  const next = String(nextStatus || "").trim().toLowerCase();
  return activeStatuses.has(previous) && !activeStatuses.has(next);
}
