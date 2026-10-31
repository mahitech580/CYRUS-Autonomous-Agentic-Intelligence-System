const CSV_COLUMNS = [
  "id", "goal", "status", "progress", "created_at", "updated_at",
  "execution_mode", "current_stage", "approval_status",
];

export function filterRuns(runs, query = "", statusFilter = "all") {
  const items = Array.isArray(runs) ? runs : [];
  const needle = String(query || "").trim().toLowerCase();
  return items.filter((run) => {
    const matchesSearch = !needle || [run.id, run.goal, run.status, run.kind]
      .some((item) => String(item || "").toLowerCase().includes(needle));
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
  const items = Array.isArray(runs) ? runs : [];
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
    agents: run?.agent_count || 7,
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
