import test from "node:test";
import assert from "node:assert/strict";
import { api, request } from "./api.js";

test("API requests disable caching and parse JSON responses", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const body = await request("/api/health");
  assert.deepEqual(body, { status: "ok" });
  assert.equal(captured.url, "http://localhost:8000/api/health");
  assert.equal(captured.options.cache, "no-store");
  assert.ok(captured.options.signal instanceof AbortSignal);
});

test("request supports Headers instances and preserves explicit authorization", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  globalThis.window = { sessionStorage: { getItem: () => "session-key" } };
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = options;
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await request("/api/runs", {
    method: "POST",
    body: "{}",
    headers: new Headers({ "X-Trace": "trace-123", Authorization: "Basic explicit-value" }),
  });
  assert.equal(captured.headers.get("x-trace"), "trace-123");
  assert.equal(captured.headers.get("content-type"), "application/json");
  assert.equal(captured.headers.get("authorization"), "Basic explicit-value");
});


test("JSON content types are parsed case-insensitively", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "Application/JSON; charset=UTF-8" },
  });
  assert.deepEqual(await request("/api/health"), { status: "ok" });
});


test("API errors preserve HTTP status and server detail", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Access denied" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

  await assert.rejects(
    request("/api/runs"),
    (error) => error.status === 401 && error.message === "Access denied",
  );
});

test("run polling API helpers honor AbortSignals and encode run IDs", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const controller = new AbortController();
  let captured;
  globalThis.fetch = (url, options) => {
    captured = { url, options };
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  };

  const pending = api.getRunStatus("RUN/1", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(captured.url, "http://localhost:8000/api/runs/RUN%2F1/status");
  assert.equal(captured.options.signal.aborted, true);
});


test("HTTP errors expose the server request ID for support diagnostics", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Provider unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "x-request-id": "cyrus-request-42" },
  });

  await assert.rejects(
    request("/api/runs"),
    (error) => error.status === 503
      && error.requestId === "cyrus-request-42"
      && error.message === "Provider unavailable (Request ID: cyrus-request-42)",
  );
});


test("API timeouts abort a stalled request with an actionable message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    request("/api/health", { timeoutMs: 5 }),
    (error) => error.name === "TimeoutError" && /timed out/i.test(error.message),
  );
});

test("network failures are normalized without hiding HTTP errors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };

  await assert.rejects(
    request("/api/health"),
    /Could not reach the CYRUS API/,
  );
});

test("API client parses RFC 9457 problem JSON responses", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    type: "about:blank",
    title: "Service unavailable",
    detail: "The database is temporarily unavailable.",
    status: 503,
  }), {
    status: 503,
    headers: { "content-type": "Application/Problem+JSON; charset=utf-8" },
  });

  await assert.rejects(
    request("/api/runs"),
    (error) => error.status === 503
      && error.message === "The database is temporarily unavailable.",
  );
});


test("API client handles a null JSON error body without throwing a TypeError", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("null", {
    status: 502,
    headers: { "content-type": "application/json" },
  });

  await assert.rejects(
    request("/api/health"),
    (error) => error.status === 502 && error.message === "Request failed: 502",
  );
});


test("createRun sends the idempotency key as a request header", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = options;
    return new Response(JSON.stringify({ item: { id: "RUN-IDEMPOTENT" } }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  await api.createRun("Build an idempotent workflow", "cyrus-request-key-123");
  assert.equal(captured.headers.get("idempotency-key"), "cyrus-request-key-123");
  assert.equal(captured.method, "POST");
});


test("retryRun sends a stable idempotency key to the retry endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ item: { id: "RUN-RETRY-1" } }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  await api.retryRun("RUN-FAILED-1", "retry-request-key-123");
  assert.equal(captured.url, "http://localhost:8000/api/runs/RUN-FAILED-1/retry");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.get("idempotency-key"), "retry-request-key-123");
});


test("API client formats FastAPI validation errors into actionable field messages", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    detail: [
      { loc: ["body", "goal"], msg: "String should have at least 8 characters", type: "string_too_short" },
      { loc: ["body", "other"], msg: "Field required", type: "missing" },
    ],
  }), {
    status: 422,
    headers: { "content-type": "application/json", "x-request-id": "validation-42" },
  });

  await assert.rejects(
    request("/api/runs"),
    (error) => error.status === 422
      && error.requestId === "validation-42"
      && error.message === "goal: String should have at least 8 characters; other: Field required (Request ID: validation-42)",
  );
});

test("retryRun posts to the encoded workflow retry endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ item: { id: "RUN-RETRY" } }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  await api.retryRun("RUN/failed");
  assert.equal(captured.url, "http://localhost:8000/api/runs/RUN%2Ffailed/retry");
  assert.equal(captured.options.method, "POST");
});


test("runtime snapshot verifies API health before returning configuration", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const body = url.endsWith("/api/health")
      ? { status: "degraded" }
      : { provider_configured: true, can_start_runs: false };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const snapshot = await api.runtime();
  assert.deepEqual(snapshot, { provider_configured: true, can_start_runs: false });
  assert.deepEqual(calls, [
    "http://localhost:8000/api/health",
    "http://localhost:8000/api/config",
  ]);
});

test("runtime snapshot stops before configuration when the health probe fails", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ detail: "API unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(api.runtime(), (error) => error.status === 503);
  assert.deepEqual(calls, ["http://localhost:8000/api/health"]);
});
