import test from "node:test";
import assert from "node:assert/strict";
import { request } from "./api.js";

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
