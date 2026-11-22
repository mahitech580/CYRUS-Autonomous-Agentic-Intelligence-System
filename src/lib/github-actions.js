const RUNS_PATH = "/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/";
const PRIMARY_FILTER_STATES = new Set(["queued", "in_progress", "success", "failure", "timed_out", "startup_failure", "cancelled"]);
const KNOWN_STATES = new Set([
  "queued", "in_progress", "success", "failure", "cancelled", "timed_out", "startup_failure",
  "action_required", "skipped", "neutral", "stale", "completed",
  "waiting", "pending", "requested",
]);
function cleanText(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function validRunId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function validDate(value) {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return value;
}
function safeRunUrl(value, id) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.origin === "https://github.com"
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === RUNS_PATH + id ? url.href : "";
  } catch { return ""; }
}
export function parseGitHubRetryAfter(value, now = Date.now()) {
  const header = String(value ?? "").trim();
  if (!header) return null;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const retryAt = Date.parse(header);
  const currentTime = Number(now);
  if (!Number.isFinite(retryAt) || !Number.isFinite(currentTime)) return null;
  return Math.max(0, Math.ceil((retryAt - currentTime) / 1000));
}
function formatWait(seconds) {
  if (seconds < 60) return seconds + " seconds";
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return minutes + (minutes === 1 ? " minute" : " minutes");
  }
  if (seconds < 86400) {
    const hours = Math.ceil(seconds / 3600);
    return hours + (hours === 1 ? " hour" : " hours");
  }
  const days = Math.ceil(seconds / 86400);
  return days + (days === 1 ? " day" : " days");
}
export function getWorkflowRunsErrorMessage(status, headers, now = Date.now()) {
  const code = Number(status);
  const remaining = headers?.get?.("x-ratelimit-remaining");
  const retryAfter = parseGitHubRetryAfter(headers?.get?.("retry-after"), now);
  const resetValue = String(headers?.get?.("x-ratelimit-reset") ?? "").trim();
  const resetTimestamp = /^\d+$/.test(resetValue) ? Number(resetValue) : NaN;
  const resetSeconds = Number.isSafeInteger(resetTimestamp) && Number.isFinite(Number(now))
    ? Math.max(0, Math.ceil(resetTimestamp - Number(now) / 1000))
    : null;
  const rateLimited = code === 429 || (code === 403 && (remaining === "0" || retryAfter !== null));
  if (rateLimited) {
    const wait = retryAfter ?? (remaining === "0" ? resetSeconds : null);
    if (wait !== null && wait > 0) {
      return "GitHub's public API rate limit has been reached. Try again in about " + formatWait(wait) + " or open Actions directly.";
    }
    return "GitHub's public API rate limit has been reached. Wait for the reset window or open Actions directly.";
  }
  return "GitHub Actions returned HTTP " + (Number.isFinite(code) ? code : "unknown") + ". Check the public repository or open Actions directly.";
}

/** Normalize only public workflow-run records belonging to this repository. */
export function normalizeWorkflowRuns(payload, limit = 12) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !Array.isArray(payload.workflow_runs)) {
    throw new TypeError("GitHub Actions returned an invalid workflow-runs response.");
  }
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 30) : 12;
  const runs = [];
  for (const record of payload.workflow_runs) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const id = validRunId(record.id);
    if (id === null) continue;
    const url = safeRunUrl(record.html_url, id);
    if (!url) continue;
    const rawStatus = cleanText(record.status, 40).toLowerCase();
    const rawConclusion = cleanText(record.conclusion, 40).toLowerCase();
    const sha = typeof record.head_sha === "string" && /^[a-f0-9]{40}$/i.test(record.head_sha)
      ? record.head_sha.toLowerCase() : "";
    runs.push({
      id,
      name: cleanText(record.name, 120) || "Workflow run",
      runNumber: Number.isSafeInteger(record.run_number) && record.run_number > 0 ? record.run_number : null,
      status: rawStatus,
      conclusion: rawConclusion || null,
      event: cleanText(record.event, 80),
      branch: cleanText(record.head_branch, 160),
      sha,
      createdAt: validDate(record.created_at),
      updatedAt: validDate(record.updated_at),
      url,
    });
  }
  runs.sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return rightTime - leftTime;
  });
  const reportedTotal = payload.total_count;
  const totalCount = Number.isSafeInteger(reportedTotal) && reportedTotal >= 0
    ? Math.max(reportedTotal, runs.length)
    : Math.max(payload.workflow_runs.length, runs.length);
  return { totalCount, runs: runs.slice(0, safeLimit) };
}
export function getWorkflowRunStatus(run) {
  const status = cleanText(run?.status, 40).toLowerCase();
  if (status === "completed") {
    const conclusion = cleanText(run?.conclusion, 40).toLowerCase();
    return KNOWN_STATES.has(conclusion) ? conclusion : "completed";
  }
  return KNOWN_STATES.has(status) ? status : "unknown";
}
function normalizeSearch(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
export function filterWorkflowRuns(runs, query = "", statusFilter = "all") {
  const items = Array.isArray(runs) ? runs : [];
  const terms = normalizeSearch(query).match(/[\p{L}\p{N}]+/gu) || [];
  return items.filter((run) => {
    if (!run || typeof run !== "object" || Array.isArray(run)) return false;
    const state = getWorkflowRunStatus(run);
    if (statusFilter === "failure") {
      if (state !== "failure" && state !== "timed_out" && state !== "startup_failure") return false;
    } else if (statusFilter === "other") {
      if (PRIMARY_FILTER_STATES.has(state)) return false;
    } else if (statusFilter !== "all" && state !== statusFilter) {
      return false;
    }
    const searchable = normalizeSearch([run.name,run.branch,run.event,run.sha,run.runNumber,run.id,state].join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
export function summarizeWorkflowRuns(runs) {
  const summary = { inProgress: 0, queued: 0, successful: 0, failed: 0, cancelled: 0, other: 0 };
  for (const run of Array.isArray(runs) ? runs : []) {
    const state = getWorkflowRunStatus(run);
    if (state === "in_progress") summary.inProgress += 1;
    else if (state === "queued") summary.queued += 1;
    else if (state === "success") summary.successful += 1;
    else if (state === "failure" || state === "timed_out" || state === "startup_failure") summary.failed += 1;
    else if (state === "cancelled") summary.cancelled += 1;
    else summary.other += 1;
  }
  return summary;
}
