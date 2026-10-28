const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const KEY_NAME = "cyrus_access_key";

export function getAccessKey() {
  try {
    return typeof window === "undefined" ? "" : window.sessionStorage.getItem(KEY_NAME) || "";
  } catch {
    return "";
  }
}

export function setAccessKey(value) {
  try {
    if (typeof window === "undefined") return;
    const clean = String(value || "").trim();
    if (clean) window.sessionStorage.setItem(KEY_NAME, clean);
    else window.sessionStorage.removeItem(KEY_NAME);
  } catch {
    // Browser storage may be disabled; the current page can still use a fresh session.
  }
}

async function request(path, options = {}) {
  const key = getAccessKey();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(key ? { Authorization: "Bearer " + key } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(API_BASE + path, {
    ...options,
    headers,
    cache: "no-store",
  });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");
  if (!response.ok) {
    const message = typeof body === "object" ? body.detail || body.message : body;
    const error = new Error(message || ("Request failed: " + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  health: () => request("/api/health"),
  config: () => request("/api/config"),
  agents: () => request("/api/agents"),
  runs: () => request("/api/runs"),
  getRun: (runId) => request("/api/runs/" + encodeURIComponent(runId)),
  runEvents: (runId, after) => request("/api/runs/" + encodeURIComponent(runId) + "/events" + (after ? "?after=" + encodeURIComponent(after) : "")),
  approveRun: (runId, decision, note = "") => request("/api/runs/" + encodeURIComponent(runId) + "/approval", {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  }),
  cancelRun: (runId) => request("/api/runs/" + encodeURIComponent(runId) + "/cancel", {
    method: "POST",
  }),
  createRun: (goal) => request("/api/runs", {
    method: "POST",
    body: JSON.stringify({ goal }),
  }),
};