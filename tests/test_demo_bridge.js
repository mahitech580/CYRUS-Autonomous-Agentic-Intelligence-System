const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("demo-bridge.js", "utf8");
const taskExport = require("../task-export.js");

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
    CYRUS_TASK_EXPORT: taskExport,
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
  const retentionHarness = makeHarness();
  let oldestKeyTaskId = "";
  for (let index = 0; index < 26; index++) {
    const key = "retention-key-" + index;
    const submission = await retentionHarness.json("/api/execute", {
      method: "POST",
      headers: {"Idempotency-Key": key},
      body: JSON.stringify({prompt: "Retained demo history fixture " + index, mode: "autonomous"})
    });
    assert.equal(submission.response.status, 202);
    if (index === 0) oldestKeyTaskId = submission.body.task_id;
  }
  const expiredKey = await retentionHarness.json("/api/execute", {
    method: "POST",
    headers: {"Idempotency-Key": "retention-key-0"},
    body: JSON.stringify({prompt: "Retained demo history fixture 0", mode: "autonomous"})
  });
  assert.equal(expiredKey.response.status, 410);
  assert.equal(expiredKey.body.expired, true);
  assert.ok(oldestKeyTaskId);
  const boundedTasks = await retentionHarness.json("/api/tasks");
  assert.equal(boundedTasks.body.length, 25, "browser demo history must remain bounded");

  const timeoutHarness = makeHarness();
  const timeoutStart = await timeoutHarness.json("/api/execute", {
    method: "POST",
    body: JSON.stringify({prompt: "Please simulate timeout in demo", mode: "autonomous"})
  });
  assert.equal(timeoutStart.response.status, 202);
  assert.equal(timeoutStart.body.status, "TIMED_OUT");
  const timedOutId = timeoutStart.body.task_id;
  const timeoutDetail = await timeoutHarness.json("/api/tasks/" + encodeURIComponent(timedOutId));
  assert.equal(timeoutDetail.body.failure.type, "TaskTimedOut");
  assert.equal(timeoutDetail.body.tests_passed, 0);
  assert.equal(timeoutDetail.body.tests_failed, 0);
  assert.equal(timeoutDetail.body.coverage, 0);
  assert.equal(timeoutDetail.body.artifacts.length, 0);
  assert.equal(timeoutDetail.body.verification_status, "SYNTHETIC_DEMO_ONLY");
  assert.match(timeoutDetail.body.summary, /synthetic demo timeout/i);
  const timeoutRecovery = await timeoutHarness.json("/api/tasks/" + encodeURIComponent(timedOutId) + "/recovery");
  assert.equal(timeoutRecovery.response.status, 200);
  assert.equal(timeoutRecovery.body.schema_version, 1);
  assert.equal(timeoutRecovery.body.category, "synthetic_demo");
  assert.equal(timeoutRecovery.body.synthetic_demo, true);
  assert.equal(timeoutRecovery.body.can_retry, true);
  assert.equal(timeoutRecovery.body.source, "deterministic_runtime_guidance");
  assert.equal(timeoutRecovery.body.recommended_action, "review_demo_limits");

  for (const [taskId, status, expectedCategory, expectedAction] of [
    ["DEMO-ACTION-CANCELLED", "CANCELLED", "cancelled", "review_stop_point"],
    ["DEMO-ACTION-COMPLETED", "COMPLETED", "completed", "verify_in_sandbox"],
    ["DEMO-ACTION-RUNNING", "RUNNING", "in_progress", "monitor_or_cancel"],
    ["DEMO-ACTION-APPROVAL", "AWAITING_APPROVAL", "in_progress", "monitor_or_cancel"]
  ]) {
    const stateHarness = makeHarness({storedTasks: [{
      task_id: taskId,
      objective: "Verify recovery state actions",
      mode: "autonomous",
      status,
      created_at: new Date().toISOString(),
      events: []
    }]});
    const stateGuidance = await stateHarness.json("/api/tasks/" + encodeURIComponent(taskId) + "/recovery");
    assert.equal(stateGuidance.response.status, 200);
    assert.equal(stateGuidance.body.category, expectedCategory);
    assert.equal(stateGuidance.body.recommended_action, expectedAction);
  }

  const guidanceSecret = "recovery-private-sentinel";
  const guidanceHarness = makeHarness({storedTasks: [{
    task_id: "DEMO-GUIDANCE-PROVIDER",
    objective: "Inspect safe guidance",
    mode: "autonomous",
    status: "FAILED",
    provider: "openai",
    retry_number: 0,
    max_task_retries: 3,
    failure: {type: "ProviderConnectionError", message: guidanceSecret},
    created_at: new Date().toISOString(),
    events: []
  }]});
  const guidanceResponse = await guidanceHarness.json("/api/tasks/DEMO-GUIDANCE-PROVIDER/recovery");
  assert.equal(guidanceResponse.response.status, 200);
  assert.equal(guidanceResponse.body.category, "provider_or_network");
  assert.ok(!JSON.stringify(guidanceResponse.body).includes(guidanceSecret));

  const missingRecovery = await guidanceHarness.json("/api/tasks/DEMO-GUIDANCE-MISSING/recovery");
  assert.equal(missingRecovery.response.status, 404);
  assert.equal(missingRecovery.body.error, "Task not found");

  const configurationGuidanceHarness = makeHarness({storedTasks: [{
    task_id: "DEMO-GUIDANCE-AUTH",
    objective: "Inspect backend configuration",
    mode: "autonomous",
    status: "FAILED",
    provider: "openai",
    retry_number: 0,
    max_task_retries: 3,
    failure: {type: "ProviderAuthenticationError", message: "configured credential must not be echoed"},
    created_at: new Date().toISOString(),
    events: []
  }]});
  const authGuidance = await configurationGuidanceHarness.json("/api/tasks/DEMO-GUIDANCE-AUTH/recovery");
  assert.equal(authGuidance.body.category, "provider_configuration");
  assert.match(authGuidance.body.retry_guidance, /Fix the configuration first/);
  assert.ok(!JSON.stringify(authGuidance.body).includes("configured credential"));

  for (const [failureType, expectedCategory, expectedAction] of [
    ["GeneratedArtifactError", "execution_failure", "inspect_last_successful_stage"],
    ["ProviderResponseError", "provider_response", "inspect_response_format"],
    ["RateLimitExceededError", "rate_limited", "wait_for_provider_reset"],
    ["HTTP429Error", "rate_limited", "wait_for_provider_reset"],
    ["ProviderConnectionError", "provider_or_network", "check_provider_connectivity"],
    ["DeadlineExceededError", "timeout", "reduce_scope_and_inspect_trace"],
    ["APIKeyMissingError", "provider_configuration", "correct_provider_configuration"],
    ["UnauthorizedError", "provider_configuration", "correct_provider_configuration"],
    ["TooManyRequestsError", "rate_limited", "wait_for_provider_reset"],
    ["ServiceUnavailableError", "provider_or_network", "check_provider_connectivity"],
    ["TimedOutError", "timeout", "reduce_scope_and_inspect_trace"]
  ]) {
    const caseHarness = makeHarness({storedTasks: [{
      task_id: "DEMO-TOKEN-" + failureType,
      objective: "Verify recovery exception classification",
      mode: "autonomous",
      status: "FAILED",
      provider: "openai",
      failure: {type: failureType, message: "private-classification-sentinel"},
      created_at: new Date().toISOString(),
      events: []
    }]});
    const classified = await caseHarness.json(
      "/api/tasks/" + encodeURIComponent("DEMO-TOKEN-" + failureType) + "/recovery"
    );
    assert.equal(classified.response.status, 200, failureType);
    assert.equal(classified.body.category, expectedCategory, failureType);
    assert.equal(classified.body.recommended_action, expectedAction, failureType);
    assert.ok(!JSON.stringify(classified.body).includes("private-classification-sentinel"));
    if (expectedCategory === "rate_limited") {
      assert.match(classified.body.retry_guidance, /reset window/);
    }
  }

  const timeoutRetry = await timeoutHarness.json("/api/tasks/" + encodeURIComponent(timedOutId) + "/retry", {
    method: "POST",
    headers: {"Idempotency-Key": "demo-timeout-retry-001"}
  });
  assert.equal(timeoutRetry.response.status, 202);
  assert.equal(timeoutRetry.body.status, "COMPLETED");
  assert.equal(timeoutRetry.body.retry_of, timedOutId);
  assert.equal(timeoutRetry.body.retry_number, 1);
  const timeoutLineage = await timeoutHarness.json("/api/tasks/" + encodeURIComponent(timeoutRetry.body.task_id) + "/lineage");
  assert.equal(timeoutLineage.body.attempt_count, 2);
  assert.equal(timeoutLineage.body.attempts[0].status, "TIMED_OUT");
  const timeoutAnalytics = await timeoutHarness.json("/api/analytics?days=7");
  assert.equal(timeoutAnalytics.body.retry_outcomes.total_attempts, 1);
  assert.equal(timeoutAnalytics.body.retry_outcomes.recovered_after_failure, 1);
  assert.equal(timeoutAnalytics.body.retry_outcomes.recovery_rate, 100);

  const archiveHarness = makeHarness({storedTasks: [{
    task_id: "DEMO-ARCHIVE-SECRET",
    objective: "Synthetic archive fixture",
    mode: "autonomous",
    status: "COMPLETED",
    api_key: "sentinel-provider-secret",
    authorization: "Bearer sentinel-authorized-secret",
    idempotency_key: "sentinel-idempotency-secret",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    events: [{event_id: "DEMO-ARCHIVE-SECRET-E001", agent: "ORCHESTRATOR", message: "safe event"}],
    artifacts: [],
    agents: []
  }]});
  const archiveResult = await archiveHarness.json("/api/demo/export");
  assert.equal(archiveResult.response.status, 200);
  assert.equal(archiveResult.body.format, "CYRUS_BROWSER_DEMO_ARCHIVE");
  assert.equal(archiveResult.body.schema_version, 1);
  assert.equal(archiveResult.body.task_count, 1);
  assert.equal(archiveResult.body.persistence, "browser-local-only");
  assert.equal(archiveResult.body.tasks[0].format, "CYRUS_EXECUTION_REPORT");
  assert.equal(archiveResult.body.tasks[0].task.task_id, "DEMO-ARCHIVE-SECRET");
  assert.ok(!Object.hasOwn(archiveResult.body.tasks[0].task, "api_key"));
  assert.ok(!Object.hasOwn(archiveResult.body.tasks[0].task, "authorization"));
  assert.ok(!Object.hasOwn(archiveResult.body.tasks[0].task, "idempotency_key"));
  assert.ok(!JSON.stringify(archiveResult.body).includes("sentinel-provider-secret"));
  assert.ok(!JSON.stringify(archiveResult.body).includes("sentinel-idempotency-secret"));

  const harness = makeHarness();
  const nativeRequestHarness = makeHarness();
  const nativeRequest = new Request("https://demo.example/api/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "native-request-001"
    },
    body: JSON.stringify({prompt: "Run using the browser Request API", mode: "autonomous"})
  });
  const nativeResponse = await nativeRequestHarness.request(nativeRequest);
  assert.equal(nativeResponse.status, 202, "the demo adapter must understand native Request inputs");
  const nativeTask = await nativeResponse.json();
  assert.equal(nativeTask.demo_only, true);
  const nativeListRequest = new Request("https://demo.example/api/tasks?limit=10");
  const nativeListResponse = await nativeRequestHarness.request(nativeListRequest);
  assert.equal(nativeListResponse.status, 200);
  assert.equal((await nativeListResponse.json())[0].task_id, nativeTask.task_id);

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
  const defaultAnalytics = await harness.json("/api/analytics");
  assert.equal(defaultAnalytics.response.status, 200);
  assert.equal(defaultAnalytics.body.window_days, 7, "omitted analytics window should default to seven days");
  assert.equal(defaultAnalytics.body.daily.length, 7);
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
