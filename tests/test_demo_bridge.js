const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("demo-bridge.js", "utf8");

function makeHarness({explicitDemoMode = true, fetchImpl, storedTasks = []} = {}) {
  const store = new Map();
  if (storedTasks.length) store.set("cyrus-demo-tasks-v1", JSON.stringify(storedTasks));
  let originalFetchCalls = 0;
  const originalFetch = fetchImpl || (async () => {
    originalFetchCalls++;
    return new Response("<html>Static-host 404</html>", {
      status: 404,
      headers: {"Content-Type": "text/html"}
    });
  });
  const window = {
    location: {origin: "https://demo.example", search: explicitDemoMode ? "?demo=1" : ""},
    CYRUS_CONFIG: {
      apiBaseUrl: explicitDemoMode ? "" : "https://api.example.test",
      runtime: explicitDemoMode ? "browser-demo" : "remote-api",
      explicitDemoMode
    },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); }
    },
    fetch: async (...args) => originalFetch(...args)
  };
  vm.runInNewContext(source, {
    window,
    Response,
    URL,
    URLSearchParams,
    ReadableStream,
    TextEncoder,
    Date,
    JSON,
    String,
    Array,
    Promise,
    Math,
    Error,
    Map,
    Set,
    Number,
    Object,
    Boolean,
    RegExp,
    decodeURIComponent,
    setTimeout,
    clearTimeout
  });
  return {
    window,
    store,
    originalFetchCalls: () => originalFetchCalls,
    async request(path, init) { return window.fetch(path, init); },
    async json(path, init = {}) {
      const options = {...init};
      const headers = {...(options.headers || {})};
      if (options.body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      options.headers = headers;
      const response = await window.fetch(path, options);
      return {response, body: await response.json()};
    }
  };
}

async function main() {
  const harness = makeHarness();
  let result = await harness.json("/api/health");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.runtime, "browser-demo");
  assert.equal(result.body.persistence, "browser-local-only");
  assert.equal(harness.originalFetchCalls(), 0, "explicit demo mode must bypass even an HTTP 404");

  result = await harness.json("/api/agents");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.length, 7);
  result = await harness.json("/api/tools");
  assert.ok(result.body.some((tool) => tool.route === "test.run"));
  result = await harness.json("/api/metrics");
  assert.equal(result.body.persisted_tasks, 0);

  const missingMediaType = await harness.request("/api/execute", {
    method: "POST",
    body: JSON.stringify({prompt: "must be rejected without a media type", mode: "autonomous"})
  });
  assert.equal(missingMediaType.status, 415);
  const unsupportedMediaType = await harness.request("/api/execute", {
    method: "POST",
    headers: {"Content-Type": "text/plain"},
    body: JSON.stringify({prompt: "must be rejected", mode: "autonomous"})
  });
  assert.equal(unsupportedMediaType.status, 415);
  assert.equal((await unsupportedMediaType.json()).error, "Content-Type must be application/json");

  result = await harness.json("/api/execute", {
    method: "POST",
    body: JSON.stringify({prompt: "Demo supervised flow", mode: "supervised"})
  });
  assert.equal(result.response.status, 202);
  const supervised = result.body;
  assert.equal(supervised.status, "AWAITING_APPROVAL");
  assert.equal(supervised.demo_only, true);

  result = await harness.json("/api/tasks/" + encodeURIComponent(supervised.task_id));
  assert.equal(result.body.status, "AWAITING_APPROVAL");
  assert.equal(result.body.approval_required, true);
  assert.equal(result.body.provider, "browser-demo");
  assert.equal(result.body.verification_status, "SYNTHETIC_DEMO_ONLY");

  result = await harness.json("/api/tasks/" + encodeURIComponent(supervised.task_id) + "/approve", {method: "POST"});
  assert.equal(result.response.status, 202);
  result = await harness.json("/api/tasks/" + encodeURIComponent(supervised.task_id));
  assert.equal(result.body.status, "COMPLETED");
  assert.equal(result.body.current_agent, "RELEASE");
  assert.equal(result.body.events.at(-1).phase, "APPROVED");

  result = await harness.json("/api/metrics");
  assert.equal(result.body.completed_tasks, 1);
  assert.equal(result.body.awaiting_approval, 0);

  result = await harness.json("/api/execute", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-execute-001"},
    body: JSON.stringify({prompt: "Build a deterministic browser demo", mode: "autonomous"})
  });
  assert.equal(result.response.status, 202);
  const original = result.body;
  assert.equal(original.status, "COMPLETED");

  const duplicate = await harness.json("/api/execute", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-execute-001"},
    body: JSON.stringify({prompt: "Build a deterministic browser demo", mode: "autonomous"})
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.task_id, original.task_id);
  assert.equal(duplicate.body.deduplicated, true);

  const conflict = await harness.json("/api/execute", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-execute-001"},
    body: JSON.stringify({prompt: "A different objective", mode: "autonomous"})
  });
  assert.equal(conflict.response.status, 409);

  const failedResponse = await harness.json("/api/execute", {
    method: "POST",
    body: JSON.stringify({prompt: "Please simulate failure for retry demo", mode: "autonomous"})
  });
  assert.equal(failedResponse.response.status, 202);
  const failed = failedResponse.body;
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.demo_only, true);
  let detail = await harness.json("/api/tasks/" + encodeURIComponent(failed.task_id));
  assert.equal(detail.body.failure.type, "DemoFailure");

  const retryResponse = await harness.json("/api/tasks/" + encodeURIComponent(failed.task_id) + "/retry", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-retry-001"}
  });
  assert.equal(retryResponse.response.status, 202);
  const retry = retryResponse.body;
  assert.notEqual(retry.task_id, failed.task_id);
  assert.equal(retry.retry_of, failed.task_id);
  assert.equal(retry.retry_number, 1);
  assert.equal(retry.status, "COMPLETED");
  assert.equal(retry.deduplicated, false);

  const duplicateRetry = await harness.json("/api/tasks/" + encodeURIComponent(failed.task_id) + "/retry", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-retry-001"}
  });
  assert.equal(duplicateRetry.response.status, 200);
  assert.equal(duplicateRetry.body.task_id, retry.task_id);
  assert.equal(duplicateRetry.body.deduplicated, true);

  const freshKeyDuplicate = await harness.json("/api/tasks/" + encodeURIComponent(failed.task_id) + "/retry", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-retry-002"}
  });
  assert.equal(freshKeyDuplicate.response.status, 200);
  assert.equal(freshKeyDuplicate.body.task_id, retry.task_id);
  assert.equal(freshKeyDuplicate.body.deduplicated, true);

  detail = await harness.json("/api/tasks/" + encodeURIComponent(retry.task_id));
  assert.equal(detail.body.parent_task_id, failed.task_id);
  assert.equal(detail.body.retry_number, 1);
  assert.equal(detail.body.retry_reason, "FAILED:DemoFailure");
  assert.equal(detail.body.events[0].phase, "RETRY_CREATED");

  const lineage = await harness.json("/api/tasks/" + encodeURIComponent(retry.task_id) + "/lineage");
  assert.equal(lineage.response.status, 200);
  assert.equal(lineage.body.root_task_id, failed.task_id);
  assert.equal(lineage.body.attempt_count, 2);
  assert.deepEqual(
    lineage.body.attempts.map((task) => task.task_id),
    [failed.task_id, retry.task_id]
  );
  assert.ok(!Object.hasOwn(lineage.body.attempts[0], "implementation"));

  const filtered = await harness.json("/api/tasks?status=FAILED&mode=autonomous&limit=10&q=simulate");
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.length, 1);
  assert.equal(filtered.body[0].task_id, failed.task_id);

  const analytics = await harness.json("/api/analytics?days=7");
  assert.equal(analytics.response.status, 200);
  assert.equal(analytics.body.source, "browser_local_demo_storage");
  assert.equal(analytics.body.retry_outcomes.total_attempts, 1);
  assert.equal(analytics.body.retry_outcomes.completed, 1);
  assert.equal(analytics.body.retry_outcomes.recovered_after_failure, 1);
  assert.equal(analytics.body.retry_outcomes.recovery_rate, 100);
  assert.ok(Array.isArray(analytics.body.daily));
  assert.equal(analytics.body.history_store.durability, "browser_local_only");

  for (const query of ["?limit=not-a-number", "?offset=1.5"]) {
    const invalidList = await harness.json("/api/tasks" + query);
    assert.equal(invalidList.response.status, 400, "invalid list pagination must match the backend contract");
    assert.match(invalidList.body.error, /limit and offset must be integers/);
  }
  for (const query of ["?status=NEVER-A-STATUS", "?mode=python"]) {
    const invalidFilter = await harness.json("/api/tasks" + query);
    assert.equal(invalidFilter.response.status, 400, "unsupported list filters must be rejected");
  }
  for (const query of ["?days=week", "?days=1.5", "?days="]) {
    const invalidWindow = await harness.json("/api/analytics" + query);
    assert.equal(invalidWindow.response.status, 400, "invalid analytics windows must be rejected");
    assert.match(invalidWindow.body.error, /days must be an integer/);
  }
  const widestWindow = await harness.json("/api/analytics?days=900");
  assert.equal(widestWindow.response.status, 200);
  assert.equal(widestWindow.body.window_days, 90);
  const minimumWindow = await harness.json("/api/analytics?days=0");
  assert.equal(minimumWindow.response.status, 200);
  assert.equal(minimumWindow.body.window_days, 1);

  const streamUrl = "/api/tasks/" + encodeURIComponent(retry.task_id) + "/stream";
  const stream = await harness.request(streamUrl);
  assert.equal(stream.status, 200);
  const fullStreamBody = await stream.text();
  assert.match(fullStreamBody, /event: trace/);
  assert.match(fullStreamBody, new RegExp("id: " + retry.task_id + "-E001"));
  assert.match(fullStreamBody, new RegExp("id: " + retry.task_id + "-E008"));

  const resumedStream = await harness.request(streamUrl, {
    headers: {"Last-Event-ID": retry.task_id + "-E004"}
  });
  const resumedBody = await resumedStream.text();
  assert.doesNotMatch(resumedBody, new RegExp("id: " + retry.task_id + "-E004"));
  assert.doesNotMatch(resumedBody, new RegExp("id: " + retry.task_id + "-E003"));
  assert.match(resumedBody, new RegExp("id: " + retry.task_id + "-E005"));
  assert.match(resumedBody, new RegExp("id: " + retry.task_id + "-E008"));

  const foreignCursor = await harness.request(streamUrl, {
    headers: {"Last-Event-ID": "DEMO-FOREIGN-TASK-E999"}
  });
  assert.match(await foreignCursor.text(), new RegExp("id: " + retry.task_id + "-E001"));

  const oversizedCursor = await harness.request(streamUrl, {
    headers: {"Last-Event-ID": retry.task_id + "-E" + "9".repeat(5000)}
  });
  assert.match(await oversizedCursor.text(), new RegExp("id: " + retry.task_id + "-E001"));

  result = await harness.json("/api/execute", {method: "POST", body: "{bad json"});
  assert.equal(result.response.status, 400);
  result = await harness.json("/api/execute", {method: "POST", body: JSON.stringify({prompt: "   "})});
  assert.equal(result.response.status, 400);
  result = await harness.json("/api/execute", {method: "POST", body: JSON.stringify({prompt: "valid", mode: "invalid"})});
  assert.equal(result.response.status, 400);
  result = await harness.json("/api/execute", {method: "POST", body: JSON.stringify({prompt: "x".repeat(4001)})});
  assert.equal(result.response.status, 413);
  result = await harness.json("/api/no-such-route");
  assert.equal(result.response.status, 404);
  result = await harness.json("/api/tasks/" + encodeURIComponent(original.task_id) + "/retry", {method: "POST"});
  assert.equal(result.response.status, 409, "completed tasks cannot be retried");
  result = await harness.json("/api/tasks/" + encodeURIComponent("DEMO-MISSING"));
  assert.equal(result.response.status, 404);

  const failClosedCalls = [];
  const remoteHarness = makeHarness({
    explicitDemoMode: false,
    fetchImpl: async (input) => {
      failClosedCalls.push(String(input));
      return new Response(JSON.stringify({error: "remote not found"}), {status: 404, headers: {"Content-Type": "application/json"}});
    }
  });
  const remote = await remoteHarness.request("/api/health");
  assert.equal(remote.status, 404);
  assert.equal(failClosedCalls.length, 1, "normal remote mode must never substitute local demo data");

  const capped = makeHarness({storedTasks: [{
    task_id: "DEMO-RETRY-CAPPED",
    objective: "Retry cap fixture",
    mode: "autonomous",
    status: "FAILED",
    retry_number: 3,
    max_task_retries: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    events: []
  }]});
  result = await capped.json("/api/tasks/DEMO-RETRY-CAPPED/retry", {method: "POST"});
  assert.equal(result.response.status, 409);
  assert.equal(result.body.effective_max_task_retries, 3);

  const cyclic = makeHarness({storedTasks: [
    {task_id: "DEMO-CYCLE-A", objective: "cycle", mode: "autonomous", status: "FAILED", retry_number: 1, parent_task_id: "DEMO-CYCLE-B", created_at: "2026-10-20T10:00:00Z"},
    {task_id: "DEMO-CYCLE-B", objective: "cycle", mode: "autonomous", status: "FAILED", retry_number: 2, parent_task_id: "DEMO-CYCLE-A", created_at: "2026-10-20T10:01:00Z"}
  ]});
  result = await cyclic.json("/api/tasks/DEMO-CYCLE-A/lineage");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.attempt_count, 2);
  assert.equal(new Set(result.body.attempts.map((task) => task.task_id)).size, 2);

  const recordsBeforeReset = await harness.json("/api/tasks");
  assert.ok(recordsBeforeReset.body.length >= 3, "reset should clear the supervised, failed, and retry records created above");
  const reset = await harness.json("/api/demo/reset", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: "{}"
  });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.cleared_tasks, recordsBeforeReset.body.length);
  assert.equal(reset.body.persistence, "browser-local-only");
  const emptyAfterReset = await harness.json("/api/tasks");
  assert.equal(emptyAfterReset.body.length, 0);
  const resetMetrics = await harness.json("/api/metrics");
  assert.equal(resetMetrics.body.persisted_tasks, 0);
  const resetAnalytics = await harness.json("/api/analytics?days=7");
  assert.equal(resetAnalytics.body.retry_outcomes.total_attempts, 0);
  const reusedKey = await harness.json("/api/execute", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-execute-001"},
    body: JSON.stringify({prompt: "A new run after clearing demo history", mode: "autonomous"})
  });
  assert.equal(reusedKey.response.status, 202, "clearing demo history also clears its in-memory idempotency cache");
  assert.notEqual(reusedKey.body.task_id, original.task_id);

  console.log("Demo bridge contract: explicit no-network mode, API validation, idempotency, retry lineage, analytics, SSE, and cycle guards OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
