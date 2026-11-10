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
    if (typeof window === "undefined") return false;
    const clean = String(value || "").trim();
    if (clean) window.sessionStorage.setItem(KEY_NAME, clean);
    else window.sessionStorage.removeItem(KEY_NAME);
    return (window.sessionStorage.getItem(KEY_NAME) || "") === clean;
  } catch {
    // Browser storage may be disabled; callers must not reload as if the key was saved.
    return false;
  }
}


function errorMessageFromBody(body, status) {
  let detail = body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    detail = body.detail ?? body.message ?? body.title;
  }
  if (Array.isArray(detail)) {
    const messages = detail.map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return "";
      const message = typeof entry.msg === "string"
        ? entry.msg
        : typeof entry.message === "string" ? entry.message : "";
      const location = Array.isArray(entry.loc)
        ? entry.loc.filter((part) => typeof part === "string" || typeof part === "number")
          .filter((part) => part !== "body").join(".")
        : "";
      return message ? (location ? location + ": " + message : message) : "";
    }).filter(Boolean);
    if (messages.length) return messages.join("; ").slice(0, 500);
  }
  if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 500);
  return "Request failed: " + status;
}

export async function request(path, options = {}) {
  const key = getAccessKey();
  const {
    timeoutMs = 20000,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  // Validate and normalize caller headers before allocating timers or abort listeners.
  const headers = new Headers(fetchOptions.headers || {});
  if (fetchOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (key && !headers.has("Authorization")) {
    headers.set("Authorization", "Bearer " + key);
  }

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

  try {
    const response = await fetch(API_BASE + path, {
      ...fetchOptions,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const isJson = contentType === "application/json" || contentType.endsWith("+json");
    const body = isJson
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    if (!response.ok) {
      const message = errorMessageFromBody(body, response.status);
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
  runtime: async () => {
    await request("/api/health");
    return request("/api/config");
  },
  agents: () => request("/api/agents"),
  runs: ({ limit = 30, offset = 0, status, signal } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", String(status));
    return request("/api/runs?" + params.toString(), { signal });
  },
  getRun: (runId, options = {}) => request("/api/runs/" + encodeURIComponent(runId), options),
  getRunStatus: (runId, options = {}) => request("/api/runs/" + encodeURIComponent(runId) + "/status", options),
  runEvents: (runId, after, options = {}) => request("/api/runs/" + encodeURIComponent(runId) + "/events" + (after ? "?after=" + encodeURIComponent(after) : ""), options),
  approveRun: (runId, decision, note = "") => request("/api/runs/" + encodeURIComponent(runId) + "/approval", {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  }),
  retryRun: (runId, idempotencyKey) => request("/api/runs/" + encodeURIComponent(runId) + "/retry", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  }),
  cancelRun: (runId) => request("/api/runs/" + encodeURIComponent(runId) + "/cancel", {
    method: "POST",
  }),
  createRun: (goal, idempotencyKey) => request("/api/runs", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({ goal }),
  }),
};