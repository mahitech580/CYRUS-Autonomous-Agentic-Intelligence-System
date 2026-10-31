const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
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

export async function request(path, options = {}) {
  const key = getAccessKey();
  const {
    timeoutMs = 20000,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timeout = Number.isFinite(Number(timeoutMs))
    ? Math.max(1, Math.min(Number(timeoutMs), 120000))
    : 20000;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (key && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + key);
  }

  try {
    const response = await fetch(API_BASE + path, {
      ...fetchOptions,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const body = type.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => "");
    if (!response.ok) {
      const message = typeof body === "object" ? body.detail || body.message : body;
      const requestId = response.headers.get("x-request-id");
      const error = new Error(
        (message || ("Request failed: " + response.status)) +
        (requestId ? " (Request ID: " + requestId + ")" : ""),
      );
      error.status = response.status;
      if (requestId) error.requestId = requestId;
      throw error;
    }
    return body;
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("CYRUS API request timed out. Check the service and try again.");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    if (externalSignal?.aborted) throw error;
    if (error instanceof TypeError) {
      const networkError = new Error("Could not reach the CYRUS API. Check the API URL and network connection.");
      networkError.cause = error;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export const api = {
  health: () => request("/api/health"),
  config: () => request("/api/config"),
  agents: () => request("/api/agents"),
  runs: () => request("/api/runs"),
  getRun: (runId, options = {}) => request("/api/runs/" + encodeURIComponent(runId), options),
  getRunStatus: (runId, options = {}) => request("/api/runs/" + encodeURIComponent(runId) + "/status", options),
  runEvents: (runId, after, options = {}) => request("/api/runs/" + encodeURIComponent(runId) + "/events" + (after ? "?after=" + encodeURIComponent(after) : ""), options),
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