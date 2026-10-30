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
  const text = value == null ? "" : String(value);
  return '"' + text.replace(/"/g, '""').replace(/\r?\n/g, " ") + '"';
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
