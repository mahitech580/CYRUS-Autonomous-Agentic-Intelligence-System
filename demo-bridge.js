(() => {
  "use strict";

  const originalFetch = window.fetch.bind(window);
  const agents = [
    { id: 1, name: "ORCHESTRATOR", role: "coordination", type: "control", responsibility: "Owns execution state." },
    { id: 2, name: "PLANNER", role: "decomposition", type: "reasoning", responsibility: "Breaks objectives into executable work." },
    { id: 3, name: "RESEARCHER", role: "evidence", type: "research", responsibility: "Synthesizes engineering constraints." },
    { id: 4, name: "CODER", role: "implementation", type: "builder", responsibility: "Produces implementation artifacts." },
    { id: 5, name: "TESTER", role: "validation", type: "quality", responsibility: "Runs deterministic checks." },
    { id: 6, name: "REVIEWER", role: "assurance", type: "review", responsibility: "Assesses quality and release risk." },
    { id: 7, name: "RELEASE", role: "delivery", type: "delivery", responsibility: "Finalizes the release package." }
  ];
  const tools = [
    { name: "Repository Scanner", category: "analysis", description: "Maps repository surfaces.", route: "repo.scan" },
    { name: "File Analyzer", category: "analysis", description: "Inspects source structure.", route: "file.inspect" },
    { name: "Code Analyzer", category: "quality", description: "Evaluates implementation shape.", route: "code.analyze" },
    { name: "Dependency Auditor", category: "security", description: "Checks dependency posture.", route: "deps.audit" },
    { name: "Test Runner", category: "validation", description: "Runs deterministic checks.", route: "test.run" },
    { name: "Runtime Probe", category: "runtime", description: "Probes service readiness.", route: "runtime.probe" },
    { name: "Research Gateway", category: "research", description: "Provides research abstraction.", route: "research.query" },
    { name: "Artifact Generator", category: "delivery", description: "Produces release artifacts.", route: "artifact.generate" }
  ];

  const storageKey = "cyrus-demo-tasks-v1";
  const requestKeys = new Map();
  const MAX_IDEMPOTENCY_KEYS = 256;
  let taskSequence = 0;
  let storageAvailable = true;
  const clampInteger = (value, fallback, min, max) => {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
  };
  const now = () => new Date().toISOString();
  const makeTaskId = () => "DEMO-" + Date.now().toString(36).toUpperCase() + "-" + (++taskSequence).toString(36).toUpperCase();
  const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }
  });
  const errorResponse = (error, status, fields = {}) => response({ error, ...fields }, status);
  const safeMode = (mode) => mode === "supervised" ? "supervised" : "autonomous";
  const normalizeTask = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.task_id !== "string") return null;
    const recordedLimit = clampInteger(raw.max_task_retries, 3, 0, 10);
    const retryNumber = clampInteger(raw.retry_number, 0, 0, 1000000);
    return {
      ...raw,
      mode: safeMode(raw.mode),
      parent_task_id: typeof raw.parent_task_id === "string" ? raw.parent_task_id : null,
      retry_number: retryNumber,
      retry_reason: typeof raw.retry_reason === "string" ? raw.retry_reason : null,
      max_task_retries: recordedLimit,
      effective_max_task_retries: Math.min(recordedLimit, 3),
      events: Array.isArray(raw.events) ? raw.events : [],
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts : [],
      agents: Array.isArray(raw.agents) ? raw.agents : []
    };
  };
  const loadTasks = () => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      storageAvailable = true;
      return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean).slice(0, 25) : [];
    } catch {
      // Storage can be disabled by browser privacy settings.
      storageAvailable = false;
      return [];
    }
  };
  const tasks = loadTasks();
  const persist = () => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(tasks.slice(0, 25)));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
      // This tab still works if persistent browser storage is unavailable.
    }
  };
  const find = (id) => tasks.find((task) => task.task_id === id);
  const effectiveRetryLimit = (task) => Math.min(
    clampInteger(task?.max_task_retries, 3, 0, 10),
    clampInteger(task?.effective_max_task_retries, 3, 0, 10),
    3
  );
  const appendEvent = (task, agent, phase, message) => {
    if (!Array.isArray(task.events)) task.events = [];
    const sequence = task.events.reduce((max, item) => {
      const match = String(item?.event_id || "").match(/-E([0-9]{1,8})$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0) + 1;
    task.events.push({
      event_id: task.task_id + "-E" + String(sequence).padStart(3, "0"),
      timestamp: now(),
      time: new Date().toLocaleTimeString(),
      agent,
      phase,
      message,
      duration: 0
    });
    task.updated_at = now();
  };
  const demoTask = (id, prompt, mode, options = {}) => {
    const runMode = safeMode(mode);
    const isRetry = Boolean(options.parentTaskId);
    const forcedFailure = !isRetry && /\b(?:demo[- ]fail|simulate (?:a )?failure|force demo failure)\b/i.test(prompt);
    const forcedTimeout = !isRetry && /\b(?:demo[- ]timeout|simulate (?:a )?timeout|force demo timeout)\b/i.test(prompt);
    const approval = runMode === "supervised";
    const status = approval
      ? "AWAITING_APPROVAL"
      : forcedTimeout ? "TIMED_OUT" : forcedFailure ? "FAILED" : "COMPLETED";
    const startSequence = isRetry ? 1 : 0;
    const stages = agents.map((agent, index) => ({
      event_id: id + "-E" + String(index + 1 + startSequence).padStart(3, "0"),
      timestamp: now(),
      time: new Date().toLocaleTimeString(),
      agent: agent.name,
      phase: agent.role.toUpperCase(),
      message: approval && index === 6
        ? "Demo release stage is waiting for operator approval."
        : forcedFailure && index === 4
          ? "Synthetic demo failure: the validation stage was configured to fail."
          : forcedTimeout && index === 4
            ? "Synthetic demo timeout: execution stopped at the validation deadline."
            : "Deterministic browser-demo stage completed.",
      duration: 180 + index * 45
    }));
    const task = {
      task_id: id,
      created_at: now(),
      updated_at: now(),
      objective: prompt,
      mode: runMode,
      status,
      current_agent: approval ? "REVIEWER" : forcedFailure ? "TESTER" : "RELEASE",
      approval_required: approval,
      agents: agents.map((agent, index) => ({
        ...agent,
        status: approval && index === 6 ? "QUEUED" : forcedFailure && index === 4 ? "FAILED" : forcedTimeout && index === 4 ? "TIMED_OUT" : "COMPLETED"
      })),
      events: stages,
      artifacts: approval || forcedFailure || forcedTimeout ? [] : [
        { name: "service.py", language: "Python", size: "8.4 KB", type: "implementation" },
        { name: "test_service.py", language: "Python", size: "6.1 KB", type: "test suite" },
        { name: "cyrus.manifest.json", language: "JSON", size: "2.3 KB", type: "release manifest" }
      ],
      tool_calls: approval ? 6 : 7,
      tests_passed: forcedFailure || forcedTimeout ? 0 : 18,
      tests_failed: forcedFailure ? 1 : 0,
      coverage: forcedFailure || forcedTimeout ? 0 : 92,
      quality: forcedFailure || forcedTimeout ? 35 : 94,
      confidence: approval ? 91 : forcedFailure || forcedTimeout ? 32 : 96,
      score: approval ? 92.3 : forcedFailure || forcedTimeout ? 31 : 94,
      latency_ms: 142,
      execution_time_ms: approval ? 0 : 1280,
      risk: approval ? "MEDIUM" : forcedFailure || forcedTimeout ? "HIGH" : "LOW",
      summary: approval
        ? "Browser demo paused before release and is awaiting operator approval."
        : forcedFailure
          ? "Synthetic demo failure requested by the operator; no provider or user code was executed."
          : forcedTimeout
            ? "Synthetic demo timeout requested by the operator; no provider call or user code was executed."
            : "CYRUS completed the deterministic seven-stage browser demo.",
      provider: "browser-demo",
      verification_status: "SYNTHETIC_DEMO_ONLY",
      score_method: "DEMO_FIXTURE_NOT_A_REAL_RUN",
      retry_number: clampInteger(options.retryNumber, 0, 0, 1000000),
      parent_task_id: options.parentTaskId || null,
      retry_reason: options.retryReason || null,
      max_task_retries: clampInteger(options.maxTaskRetries, 3, 0, 10),
      effective_max_task_retries: Math.min(clampInteger(options.maxTaskRetries, 3, 0, 10), 3),
      idempotency_key: options.idempotencyKey || null,
      failure: forcedFailure
        ? { type: "DemoFailure", message: "Synthetic browser-demo failure." }
        : forcedTimeout
          ? { type: "TaskTimedOut", message: "Synthetic browser-demo timeout." }
          : null
    };
    if (isRetry) {
      task.events.unshift({
        event_id: id + "-E001",
        timestamp: now(),
        time: new Date().toLocaleTimeString(),
        agent: "ORCHESTRATOR",
        phase: "RETRY_CREATED",
        message: "Browser demo retry created from " + options.parentTaskId + "; previous outcome: " + (options.retryReason || "terminal failure") + ".",
        duration: 0
      });
    }
    return task;
  };
  const taskSummary = (raw) => {
    const task = normalizeTask(raw);
    const status = String(task.status || "UNKNOWN").toUpperCase();
    const limit = effectiveRetryLimit(task);
    return {
      task_id: task.task_id,
      created_at: task.created_at,
      updated_at: task.updated_at,
      objective: task.objective || "",
      mode: task.mode,
      status,
      current_agent: task.current_agent || "ORCHESTRATOR",
      score: task.score || 0,
      execution_time_ms: task.execution_time_ms || 0,
      confidence: task.confidence || 0,
      quality: task.quality || 0,
      coverage: task.coverage || 0,
      risk: task.risk || "LOW",
      summary: task.summary || "",
      tool_calls: task.tool_calls || 0,
      tests_passed: task.tests_passed || 0,
      tests_failed: task.tests_failed || 0,
      artifact_count: task.artifacts.length,
      event_count: task.events.length,
      provider: task.provider || "browser-demo",
      verification_status: task.verification_status || "SYNTHETIC_DEMO_ONLY",
      score_method: task.score_method || "DEMO_FIXTURE_NOT_A_REAL_RUN",
      parent_task_id: task.parent_task_id,
      retry_number: task.retry_number,
      retry_reason: task.retry_reason,
      max_task_retries: task.max_task_retries,
      effective_max_task_retries: limit,
      can_retry: ["FAILED", "CANCELLED", "TIMED_OUT"].includes(status) && task.retry_number < limit
    };
  };
  const listTasks = (url) => {
    const params = url.searchParams;
    let records = tasks.map(taskSummary);
    const status = String(params.get("status") || "").trim().toUpperCase();
    const mode = String(params.get("mode") || "").trim().toLowerCase();
    const query = String(params.get("q") || "").trim().toLowerCase().slice(0, 200);
    if (status) records = records.filter((task) => task.status === status);
    if (mode) records = records.filter((task) => task.mode === mode);
    if (query) records = records.filter((task) =>
      [task.task_id, task.objective, task.summary, task.current_agent, task.mode]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
    const limit = clampInteger(params.get("limit"), 50, 1, 100);
    const offset = clampInteger(params.get("offset"), 0, 0, 10000);
    return records.slice(offset, offset + limit);
  };
  const lineage = (taskId) => {
    const target = find(taskId);
    if (!target) return null;
    let currentId = taskId;
    const ancestors = [];
    const visitedAncestors = new Set();
    while (currentId && !visitedAncestors.has(currentId) && ancestors.length < 50) {
      visitedAncestors.add(currentId);
      ancestors.push(currentId);
      const current = find(currentId);
      const parent = current?.parent_task_id;
      if (typeof parent !== "string" || !find(parent) || visitedAncestors.has(parent)) break;
      currentId = parent;
    }
    const rootId = ancestors[ancestors.length - 1] || taskId;
    const children = new Map();
    for (const task of tasks) {
      if (!task.parent_task_id || !find(task.parent_task_id)) continue;
      if (!children.has(task.parent_task_id)) children.set(task.parent_task_id, []);
      children.get(task.parent_task_id).push(task.task_id);
    }
    for (const childIds of children.values()) {
      childIds.sort((left, right) =>
        (find(left)?.retry_number || 0) - (find(right)?.retry_number || 0) ||
        String(find(left)?.created_at || "").localeCompare(String(find(right)?.created_at || "")) ||
        left.localeCompare(right)
      );
    }
    const queue = [rootId];
    const visited = new Set();
    const orderedIds = [];
    while (queue.length && orderedIds.length < 50) {
      const current = queue.shift();
      if (visited.has(current) || !find(current)) continue;
      visited.add(current);
      orderedIds.push(current);
      queue.push(...(children.get(current) || []).filter((id) => !visited.has(id)));
    }
    const truncated = queue.length > 0;
    if (!orderedIds.includes(taskId)) {
      if (orderedIds.length >= 50) orderedIds[orderedIds.length - 1] = taskId;
      else orderedIds.push(taskId);
    }
    return {
      current_task_id: taskId,
      root_task_id: rootId,
      attempt_count: orderedIds.length,
      truncated,
      attempts: orderedIds.map(find).filter(Boolean).map(taskSummary)
    };
  };
  const failureTypeTokens = (value) => String(value || "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
  const failureTypeHas = (tokens, prefixes) =>
    tokens.some((token) => prefixes.some((prefix) => token.startsWith(prefix)));

  const recoveryGuidance = (rawTask) => {
    const task = normalizeTask(rawTask);
    if (!task) return null;
    const status = String(task.status || "UNKNOWN").toUpperCase();
    const tokens = failureTypeTokens(task.failure?.type);
    const rawRetryAfter = task.failure?.retry_after_seconds;
    const retryAfterSeconds = Number.isInteger(rawRetryAfter) && rawRetryAfter >= 0 && rawRetryAfter <= 86400
      ? rawRetryAfter
      : null;
    const syntheticDemo = task.provider === "browser-demo" ||
      String(task.verification_status || "").toUpperCase() === "SYNTHETIC_DEMO_ONLY";
    let category, actionCode, headline, explanation, steps, retryGuidance;
    if (syntheticDemo) {
      category = "synthetic_demo";
      actionCode = "review_demo_limits";
      headline = "This is a browser-only simulation.";
      explanation = "The local demo records a simulated outcome; it did not call a model provider or execute user code.";
      steps = [
        "Use this record to exercise the retry, lineage, and reporting interface only.",
        "Switch back to the remote runtime for real provider-backed execution.",
        "Do not use the synthetic score, artifacts, or outcome as evidence of application correctness."
      ];
      retryGuidance = "Retrying a synthetic failed or timed-out record creates another simulated record.";
    } else if (status === "TIMED_OUT" || failureTypeHas(tokens, ["timeout", "timedout", "timed", "deadline"])) {
      category = "timeout";
      actionCode = "reduce_scope_and_inspect_trace";
      headline = "The execution deadline was reached.";
      explanation = "The runtime stopped this attempt at its configured deadline; proposed application tests are not thereby verified.";
      steps = [
        "Reduce the objective to one independently verifiable deliverable.",
        "Check provider responsiveness and timeout configuration.",
        "Inspect the trace to identify the last completed stage before retrying."
      ];
      retryGuidance = "Retry explicitly only when repeating the requested work is safe.";
    } else if (failureTypeHas(tokens, ["auth", "unauth", "credential", "config", "forbidden", "permission"]) || tokens.includes("apikey") || (tokens.includes("api") && tokens.includes("key"))) {
      category = "provider_configuration";
      actionCode = "correct_provider_configuration";
      headline = "Provider configuration needs attention.";
      explanation = "The failure type suggests an authentication or configuration problem; secret values are intentionally not shown here.";
      steps = [
        "Check the selected provider and model in runtime configuration.",
        "Verify the required credential on the backend, not in browser source code.",
        "Review sanitized provider diagnostics before retrying."
      ];
      retryGuidance = "Fix the configuration first; a retry alone will not correct missing credentials.";
    } else if (failureTypeHas(tokens, ["rate", "ratelimit", "quota", "throttl"]) || tokens.some((token) => token.includes("429")) || ["too", "many", "requests"].every((token) => tokens.includes(token))) {
      category = "rate_limited";
      actionCode = "wait_for_provider_reset";
      headline = "The provider request limit was reached.";
      explanation = "The failure type suggests a quota or rate limit; recovery guidance does not expose credential or response-body content.";
      steps = [
        "Check the provider's quota and rate-limit response headers in sanitized diagnostics.",
        "Wait for the provider's reset window instead of repeatedly resubmitting the same request.",
        "Reduce concurrency or request size if the limit is sustained."
      ];
      if (retryAfterSeconds !== null) {
        steps.splice(1, 0, "Honor the provider's Retry-After hint and wait " + retryAfterSeconds + " seconds before resubmitting.");
        retryGuidance = "Wait at least " + retryAfterSeconds + " seconds before another explicit provider-backed attempt.";
      } else {
        retryGuidance = "Wait for the provider's reset window to pass before starting another provider-backed attempt.";
      }
    } else if (failureTypeHas(tokens, ["provider"]) && failureTypeHas(tokens, ["billing", "payment"])) {
      category = "provider_billing";
      actionCode = "check_provider_billing";
      headline = "The provider requires billing or account-limit attention.";
      explanation = "The provider rejected the request with a billing-related response. The guidance deliberately omits raw response bodies and credential values.";
      steps = [
        "Check the provider account's billing status, available credits, and usage limits.",
        "Confirm the selected project or organization is the one with the intended billing configuration.",
        "Resolve the account or quota issue before submitting another provider-backed request."
      ];
      retryGuidance = "Resolve billing or account limits first; retrying alone will not restore provider access.";
    } else if (failureTypeHas(tokens, ["provider"]) && failureTypeHas(tokens, ["request"])) {
      category = "provider_request";
      actionCode = "review_request_contract";
      headline = "The provider rejected the request.";
      explanation = "The configured endpoint, model identifier, or request payload may not match the provider's supported contract; raw response content is not shown here.";
      steps = [
        "Verify the endpoint path and selected model against the provider's supported API contract.",
        "Check request-size and required-parameter limits without exposing credentials.",
        "Inspect sanitized diagnostics, correct the request or configuration, and only then retry."
      ];
      retryGuidance = "Correct the rejected request or model configuration before starting another provider-backed attempt.";
    } else if (failureTypeHas(tokens, ["response", "malformed", "decode"])) {
      category = "provider_response";
      actionCode = "inspect_response_format";
      headline = "The provider response could not be used.";
      explanation = "The provider reply was malformed, incomplete, or outside supported bounds; raw response content is not exposed in recovery guidance.";
      steps = [
        "Verify the configured endpoint and model are compatible with the expected chat-completions response format.",
        "Inspect the sanitized provider diagnostic and response-size limits.",
        "Avoid repeated requests until the response shape or endpoint configuration is corrected."
      ];
      retryGuidance = "Correct the response-format or endpoint issue before retrying; the guidance intentionally omits raw response content.";
    } else if (failureTypeHas(tokens, ["provider", "connection", "connect", "network", "http", "socket", "dns", "transport", "unreachable"]) || ["service", "unavailable"].every((token) => tokens.includes(token))) {
      category = "provider_or_network";
      actionCode = "check_provider_connectivity";
      headline = "The provider or network request failed.";
      explanation = "CYRUS records provider failures rather than silently substituting a successful result.";
      steps = [
        "Check provider availability, rate limits, and outbound network configuration.",
        "Inspect the sanitized error type and the last trace event.",
        "Retry after the provider issue is resolved; avoid repeated calls during an outage."
      ];
      retryGuidance = "A retry is explicit and may incur another provider request.";
    } else if (status === "CANCELLED") {
      category = "cancelled";
      actionCode = "review_stop_point";
      headline = "The execution was cancelled.";
      explanation = "Cancellation is a terminal state, not proof that the objective completed.";
      steps = [
        "Review the last trace event to locate the stop point.",
        "Narrow the objective or make the next milestone smaller.",
        "Confirm repeating any external side effect is safe before retrying."
      ];
      retryGuidance = "A new attempt is available when the configured retry budget allows it.";
    } else if (status === "FAILED") {
      category = "execution_failure";
      actionCode = "inspect_last_successful_stage";
      headline = "The execution failed.";
      explanation = "The available record does not contain enough validated evidence to infer a more specific root cause.";
      steps = [
        "Open the execution trace and identify the last successful stage.",
        "Review the sanitized failure type and static-analysis report.",
        "Address the first actionable failure before starting another attempt."
      ];
      retryGuidance = "Retrying creates a fresh record and does not reuse prior artifacts as validated output.";
    } else if (status === "COMPLETED") {
      category = "completed";
      actionCode = "verify_in_sandbox";
      headline = "No recovery action is required for this attempt.";
      explanation = "The task reached its recorded terminal state; completion does not mean proposed application tests were executed.";
      steps = [
        "Inspect the verification status and static-analysis report.",
        "Run suggested application tests in a suitable sandbox before treating the result as verified."
      ];
      retryGuidance = "Completed tasks are not retryable; create a new objective for additional work.";
    } else {
      category = "in_progress";
      actionCode = "monitor_or_cancel";
      headline = "The execution is not in a retryable terminal state.";
      explanation = "The task is queued, running, or waiting for approval; creating a parallel retry is not recommended.";
      steps = [
        "Refresh task status and follow the live trace.",
        "For supervised runs, approve only after reviewing the release summary.",
        "Use cooperative cancellation when the active objective should stop."
      ];
      retryGuidance = "Retry is available only after FAILED, CANCELLED, or TIMED_OUT and within the effective retry cap.";
    }
    const summary = taskSummary(task);
    return {
      schema_version: 1,
      task_id: task.task_id,
      status,
      category,
      recommended_action: actionCode,
      headline,
      explanation,
      steps,
      retry_guidance: retryGuidance,
      can_retry: Boolean(summary.can_retry),
      retry_number: summary.retry_number,
      max_task_retries: summary.max_task_retries,
      effective_max_task_retries: summary.effective_max_task_retries,
      retry_after_seconds: category === "rate_limited" ? retryAfterSeconds : null,
      synthetic_demo: syntheticDemo,
      source: "deterministic_runtime_guidance"
    };
  };

  const metrics = () => ({
    system: "CYRUS CORE 1.0",
    uptime_seconds: 0,
    capacity: 4,
    active_tasks: tasks.filter((task) => task.status === "RUNNING").length,
    awaiting_approval: tasks.filter((task) => task.status === "AWAITING_APPROVAL").length,
    completed_tasks: tasks.filter((task) => task.status === "COMPLETED").length,
    failed_tasks: tasks.filter((task) => task.status === "FAILED").length,
    cancelled_tasks: tasks.filter((task) => task.status === "CANCELLED").length,
    persisted_tasks: tasks.length,
    average_execution_ms: tasks.length
      ? Math.round(tasks.reduce((sum, task) => sum + (Number(task.execution_time_ms) || 0), 0) / tasks.length)
      : 0
  });
  const analytics = (url) => {
    const days = clampInteger(url.searchParams.get("days"), 7, 1, 90);
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + 1));
    const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);
    const daily = [];
    for (let offset = 0; offset < days; offset++) {
      const date = new Date(start.getTime() + offset * 86400000);
      daily.push({
        date: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString("en", { day: "2-digit", month: "short", timeZone: "UTC" }),
        total: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0
      });
    }
    const byDate = new Map(daily.map((item) => [item.date, item]));
    const statusCounts = {
      RUNNING: 0, QUEUED: 0, AWAITING_APPROVAL: 0,
      COMPLETED: 0, FAILED: 0, CANCELLED: 0, TIMED_OUT: 0
    };
    const providerCounts = new Map();
    const failureCounts = new Map();
    const latency = [];
    let retryTotal = 0;
    let retryCompleted = 0;
    let retryFailed = 0;
    let retryCancelled = 0;
    let retryTimedOut = 0;
    let retryActive = 0;
    let recovered = 0;
    let resolvedAfterFailure = 0;
    let eligibleAfterFailure = 0;
    let maxDepth = 0;
    const depthCounts = new Map();
    const byId = new Map(tasks.map((task) => [task.task_id, task]));
    const roots = new Set();
    for (const task of tasks) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      if (Object.prototype.hasOwnProperty.call(statusCounts, status)) statusCounts[status]++;
      const provider = String(task.provider || "browser-demo");
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
      const day = byDate.get(String(task.created_at || "").slice(0, 10));
      if (day) {
        day.total++;
        if (status === "COMPLETED") day.completed++;
        if (status === "FAILED") day.failed++;
        if (status === "CANCELLED") day.cancelled++;
        if (status === "TIMED_OUT") day.timed_out++;
      }
      if (terminalStatuses.has(status) && Number(task.execution_time_ms) > 0) latency.push(Number(task.execution_time_ms));
      const failureType = task.failure?.type;
      if (failureType) failureCounts.set(failureType, (failureCounts.get(failureType) || 0) + 1);
      const depth = clampInteger(task.retry_number, 0, 0, 1000000);
      if (!depth) continue;
      retryTotal++;
      maxDepth = Math.max(maxDepth, depth);
      const depthBucket = depthCounts.get(depth) || { retry_number: depth, total: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0, active: 0, terminal: 0 };
      depthBucket.total++;
      if (status === "COMPLETED") { retryCompleted++; depthBucket.completed++; }
      if (status === "FAILED") { retryFailed++; depthBucket.failed++; }
      if (status === "CANCELLED") { retryCancelled++; depthBucket.cancelled++; }
      if (status === "TIMED_OUT") { retryTimedOut++; depthBucket.timed_out++; }
      if (["RUNNING", "QUEUED", "AWAITING_APPROVAL"].includes(status)) { retryActive++; depthBucket.active++; }
      if (terminalStatuses.has(status)) depthBucket.terminal++;
      depthCounts.set(depth, depthBucket);
      let rootId = task.task_id;
      let cursor = task.task_id;
      const visited = new Set();
      for (let step = 0; step < 50; step++) {
        if (!cursor || visited.has(cursor)) break;
        visited.add(cursor);
        const parentId = byId.get(cursor)?.parent_task_id;
        if (typeof parentId !== "string" || !byId.has(parentId)) { rootId = cursor; break; }
        cursor = parentId;
      }
      if (rootId) roots.add(rootId);
      const parent = byId.get(task.parent_task_id);
      if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(String(parent?.status || "").toUpperCase())) {
        eligibleAfterFailure++;
        if (terminalStatuses.has(status)) {
          resolvedAfterFailure++;
          if (status === "COMPLETED") recovered++;
        }
      }
    }
    const terminalTotal = Object.keys(statusCounts).filter((key) => terminalStatuses.has(key)).reduce((sum, key) => sum + statusCounts[key], 0);
    const retryTerminal = retryCompleted + retryFailed + retryCancelled + retryTimedOut;
    latency.sort((left, right) => left - right);
    const median = latency.length
      ? latency.length % 2
        ? latency[Math.floor(latency.length / 2)]
        : Math.round((latency[latency.length / 2 - 1] + latency[latency.length / 2]) / 2)
      : 0;
    const p95 = latency.length ? latency[Math.max(0, Math.ceil(latency.length * 0.95) - 1)] : 0;
    const totalLatency = latency.reduce((sum, value) => sum + value, 0);
    return {
      generated_at: now(),
      window_days: days,
      source: "browser_local_demo_storage",
      totals: {
        all: tasks.length,
        completed: statusCounts.COMPLETED,
        failed: statusCounts.FAILED,
        cancelled: statusCounts.CANCELLED,
        timed_out: statusCounts.TIMED_OUT,
        running: statusCounts.RUNNING,
        queued: statusCounts.QUEUED,
        awaiting_approval: statusCounts.AWAITING_APPROVAL,
        terminal: terminalTotal,
        success_rate: terminalTotal ? Math.round(statusCounts.COMPLETED / terminalTotal * 1000) / 10 : 0
      },
      daily,
      retry_outcomes: {
        total_attempts: retryTotal,
        lineages_with_retries: roots.size,
        completed: retryCompleted,
        failed: retryFailed,
        cancelled: retryCancelled,
        timed_out: retryTimedOut,
        active: retryActive,
        terminal: retryTerminal,
        completion_rate: retryTerminal ? Math.round(retryCompleted / retryTerminal * 1000) / 10 : 0,
        eligible_after_failure: eligibleAfterFailure,
        resolved_after_failure: resolvedAfterFailure,
        recovered_after_failure: recovered,
        recovery_rate: resolvedAfterFailure ? Math.round(recovered / resolvedAfterFailure * 1000) / 10 : 0,
        max_depth: maxDepth,
        by_depth: [...depthCounts.values()].sort((left, right) => left.retry_number - right.retry_number)
      },
      providers: [...providerCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count),
      latency: {
        samples: latency.length,
        average_ms: latency.length ? Math.round(totalLatency / latency.length * 10) / 10 : 0,
        median_ms: median,
        p95_ms: p95,
        maximum_ms: latency.length ? latency[latency.length - 1] : 0
      },
      failure_types: [...failureCounts.entries()].map(([type, count]) => ({ type, count })).sort((left, right) => right.count - left.count).slice(0, 6),
      recent_tasks: tasks.slice(0, 8).map(taskSummary),
      history_store: {
        backend: "browser localStorage",
        durability: "browser_local_only",
        note: "Demo records remain in this browser profile and are not shared with or stored on the CYRUS API."
      }
    };
  };
  const readHeader = (init, name) => {
    const headers = init?.headers;
    if (headers && typeof headers.get === "function") return String(headers.get(name) || "");
    if (headers && typeof headers === "object") {
      const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
      return key ? String(headers[key] || "") : "";
    }
    return "";
  };
  const findByIdempotency = (key) => tasks.find((task) => task.idempotency_key === key);
  const registerKey = (key, task, fingerprint) => {
    if (!key) return;
    requestKeys.delete(key);
    requestKeys.set(key, { task_id: task.task_id, fingerprint });
    while (requestKeys.size > MAX_IDEMPOTENCY_KEYS) {
      requestKeys.delete(requestKeys.keys().next().value);
    }
  };
  const duplicateResponse = (task, retryOf = null) => response({
    task_id: task.task_id,
    status: task.status,
    summary: task.summary,
    mode: task.mode,
    agents: task.agents,
    retry_of: retryOf || task.parent_task_id || undefined,
    retry_number: task.retry_number,
    max_task_retries: task.max_task_retries,
    effective_max_task_retries: effectiveRetryLimit(task),
    deduplicated: true
  }, 200);
  const streamResponse = (task, lastEventId = "") => {
    const encoder = new TextEncoder();
    const cursorPrefix = task.task_id + "-E";
    const rawCursor = String(lastEventId || "").trim();
    const cursorSuffix = rawCursor.startsWith(cursorPrefix) ? rawCursor.slice(cursorPrefix.length) : "";
    const lastSequence = /^[0-9]{1,12}$/.test(cursorSuffix) ? Number(cursorSuffix) : 0;
    const state = {
      task_id: task.task_id, status: task.status, current_agent: task.current_agent,
      updated_at: task.updated_at, approval_required: Boolean(task.approval_required),
      score: task.score || 0, confidence: task.confidence || 0, quality: task.quality || 0,
      coverage: task.coverage || 0, risk: task.risk || "LOW", tool_calls: task.tool_calls || 0,
      verification_status: task.verification_status || "SYNTHETIC_DEMO_ONLY",
      static_checks_passed: 0, static_checks_failed: 0
    };
    const lines = ["event: state", "data: " + JSON.stringify(state), ""];
    (task.events || []).forEach((event) => {
      const match = String(event?.event_id || "").match(/-E([0-9]{1,12})$/);
      const sequence = match ? Number(match[1]) : 0;
      if (sequence <= lastSequence) return;
      lines.push("id: " + event.event_id, "event: trace", "data: " + JSON.stringify(event), "");
    });
    lines.push("event: close", "data: " + JSON.stringify({ task_id: task.task_id, status: task.status }), "");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
        controller.close();
      }
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no" }
    });
  };
  const handleDemoRequest = async (input, init) => {
    const rawUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input?.url || input);
    let parsed;
    try {
      parsed = new URL(rawUrl, window.location?.origin || "http://cyrus.local");
    } catch {
      return errorResponse("Invalid demo request URL", 400);
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const requestInit = {
      ...(init || {}),
      method,
      headers: init?.headers || input?.headers
    };
    const readRequestBody = async () => {
      if (init && Object.prototype.hasOwnProperty.call(init, "body")) return init.body;
      if (input && typeof input.clone === "function") {
        try { return await input.clone().text(); } catch { return ""; }
      }
      return "";
    };

    if (path === "/api/demo/reset" && method === "POST") {
      const cleared = tasks.length;
      try {
        window.localStorage.setItem(storageKey, "[]");
      } catch {
        storageAvailable = false;
        return errorResponse("Browser storage is unavailable or full; local history was not cleared", 507);
      }
      storageAvailable = true;
      tasks.splice(0, tasks.length);
      requestKeys.clear();
      return response({
        cleared_tasks: cleared,
        runtime: "browser-demo",
        persistence: "browser-local-only"
      }, 200);
    }

    if (path === "/api/demo/export" && method === "GET") {
      const exporter = window.CYRUS_TASK_EXPORT;
      if (!exporter || typeof exporter.buildTaskReport !== "function") {
        return errorResponse("Sanitized task export module is unavailable", 503);
      }
      const reports = [];
      try {
        for (const task of tasks) reports.push(exporter.buildTaskReport(task));
      } catch {
        return errorResponse("Could not build the sanitized browser-demo archive", 500);
      }
      return response({
        format: "CYRUS_BROWSER_DEMO_ARCHIVE",
        schema_version: 1,
        exported_at: now(),
        runtime: "browser-demo",
        persistence: "browser-local-only",
        task_count: reports.length,
        tasks: reports,
        notice: "Synthetic browser-demo records only. Credential-like fields are omitted; free-text secret detection is heuristic. Inspect before sharing."
      });
    }

    if (path === "/api/demo/import" && method === "POST") {
      const contentType = readHeader(requestInit, "Content-Type").split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "application/json" && !(contentType.startsWith("application/") && contentType.endsWith("+json"))) {
        return errorResponse("Content-Type must be application/json", 415);
      }
      const exporter = window.CYRUS_TASK_EXPORT;
      if (!exporter || typeof exporter.buildTaskReport !== "function") {
        return errorResponse("Sanitized task export module is unavailable", 503);
      }
      let rawBody;
      try {
        rawBody = await readRequestBody();
      } catch {
        return errorResponse("Could not read the browser-demo archive", 400);
      }
      const bodyText = typeof rawBody === "string" ? rawBody : "";
      if (bodyText.length > 1024 * 1024) {
        return errorResponse("Browser-demo archive exceeds the 1 MiB limit", 413);
      }
      let archive;
      try {
        archive = JSON.parse(bodyText || "{}");
      } catch {
        return errorResponse("Archive must be valid JSON", 400);
      }
      if (!archive || typeof archive !== "object" || Array.isArray(archive) ||
          archive.format !== "CYRUS_BROWSER_DEMO_ARCHIVE" || archive.schema_version !== 1 ||
          archive.runtime !== "browser-demo" || archive.persistence !== "browser-local-only" ||
          !Array.isArray(archive.tasks) || !Number.isInteger(archive.task_count) ||
          archive.task_count !== archive.tasks.length) {
        return errorResponse("Unsupported browser-demo archive format, metadata, count, or schema version", 400);
      }
      if (archive.tasks.length > 25) {
        return errorResponse("Archive can contain at most 25 task records", 413);
      }
      const imported = [];
      const importedIds = new Set();
      const validTaskId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
      const validStatuses = new Set([
        "QUEUED", "RUNNING", "AWAITING_APPROVAL", "COMPLETED",
        "FAILED", "CANCELLED", "TIMED_OUT"
      ]);
      try {
        for (const report of archive.tasks) {
          if (!report || typeof report !== "object" || Array.isArray(report) ||
              report.format !== "CYRUS_EXECUTION_REPORT" || report.schema_version !== 1 ||
              !report.task || typeof report.task !== "object" || Array.isArray(report.task) ||
              typeof report.task.task_id !== "string" || !validTaskId.test(report.task.task_id) ||
              !validStatuses.has(String(report.task.status || "").toUpperCase())) {
            return errorResponse("Every archive entry must be a version 1 CYRUS execution report with a valid task ID and status", 400);
          }
          const sanitized = exporter.buildTaskReport(report.task).task;
          const task = normalizeTask(sanitized);
          if (!task) return errorResponse("Archive contains an invalid task record", 400);
          task.status = String(task.status || "").toUpperCase();
          // Restored records remain historical browser fixtures, never backend executions.
          task.demo_only = true;
          task.provider = "browser-demo";
          task.verification_status = "SYNTHETIC_DEMO_ONLY";
          if (importedIds.has(task.task_id) || find(task.task_id)) {
            return errorResponse("Archive contains a duplicate task ID: " + task.task_id, 409);
          }
          importedIds.add(task.task_id);
          imported.push(task);
        }
      } catch {
        return errorResponse("Archive contains an invalid or unsanitizable task record", 400);
      }
      if (tasks.length + imported.length > 25) {
        return errorResponse("Import would exceed the 25-record browser retention limit; clear local history or import a smaller archive", 409, {
          current_count: tasks.length,
          import_count: imported.length,
          max_records: 25
        });
      }
      const nextTasks = [...imported, ...tasks].slice(0, 25);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(nextTasks));
      } catch {
        storageAvailable = false;
        return errorResponse("Browser storage is unavailable or full; archive was not imported", 507);
      }
      storageAvailable = true;
      tasks.splice(0, tasks.length, ...nextTasks);
      return response({
        imported_tasks: imported.length,
        task_count: tasks.length,
        runtime: "browser-demo",
        persistence: "browser-local-only",
        notice: "Imported reports were sanitized and remain local to this browser. They are historical records, not resumed executions."
      }, 200);
    }

    if (path === "/api/health" && method === "GET") return response({
      status: "ok", system: "CYRUS CORE 1.0", mode: "DEMO", runtime: "browser-demo",
      api_access_key_required: false, api_access_key_configured: false,
      persistence: "browser-local-only",
      storage_available: storageAvailable,
      storage_warning: storageAvailable ? null : "Browser storage is unavailable; current-session changes may not persist."
    });
    if (path === "/api/security" && method === "GET") return response({
      api_access_key_required: false, api_access_key_configured: false,
      cors_allowlist_configured: false, cors_origins: [], runtime: "browser-demo",
      note: "This simulator is local to the current browser profile and does not provide API authentication."
    });
    if (path === "/api/agents" && method === "GET") return response(agents);
    if (path === "/api/tools" && method === "GET") return response(tools);
    if (path === "/api/metrics" && method === "GET") return response(metrics());
    if (path === "/api/analytics" && method === "GET") {
      const rawDays = parsed.searchParams.get("days");
      if (rawDays !== null && !/^[+-]?[0-9]+$/.test(rawDays.trim())) {
        return errorResponse("days must be an integer between 1 and 90", 400);
      }
      return response(analytics(parsed));
    }
    if (path === "/api/memory" && method === "GET") return response(tasks.map(taskSummary));
    if (path === "/api/tasks" && method === "GET") {
      const params = parsed.searchParams;
      const isInteger = (value) => value === null || /^[+-]?[0-9]+$/.test(value.trim());
      if (!isInteger(params.get("limit")) || !isInteger(params.get("offset"))) {
        return errorResponse("limit and offset must be integers", 400);
      }
      const status = String(params.get("status") || "").trim().toUpperCase();
      const allowedStatuses = new Set([
        "QUEUED", "RUNNING", "AWAITING_APPROVAL", "COMPLETED",
        "FAILED", "CANCELLED", "TIMED_OUT"
      ]);
      if (status && !allowedStatuses.has(status)) {
        return errorResponse("Unsupported task status filter", 400);
      }
      const mode = String(params.get("mode") || "").trim().toLowerCase();
      if (mode && !["autonomous", "supervised"].includes(mode)) {
        return errorResponse("Unsupported task mode filter", 400);
      }
      return response(listTasks(parsed));
    }

    if (path === "/api/execute" && method === "POST") {
      const contentType = readHeader(requestInit, "Content-Type").split(";", 1)[0].trim().toLowerCase();
      const isJsonMediaType = contentType === "application/json" ||
        (contentType.startsWith("application/") && contentType.endsWith("+json"));
      if (!isJsonMediaType) {
        return errorResponse("Content-Type must be application/json", 415);
      }
      let body;
      try { body = JSON.parse(String((await readRequestBody()) || "{}")); } catch { return errorResponse("JSON body must be an object", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("JSON body must be an object", 400);
      if (typeof body.prompt !== "string" || !body.prompt.trim()) return errorResponse("Prompt is required", 400);
      if (body.prompt.length > 4000) return errorResponse("Prompt exceeds the 4000-character limit", 413);
      if (!["autonomous", "supervised"].includes(body.mode || "autonomous")) return errorResponse("Mode must be autonomous or supervised", 400);
      const prompt = body.prompt.trim();
      const mode = safeMode(body.mode || "autonomous");
      const key = readHeader(requestInit, "Idempotency-Key");
      if (key && (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key))) return errorResponse("Idempotency-Key must be 1-128 safe characters", 400);
      const fingerprint = JSON.stringify({ prompt, mode });
      if (key) {
        const current = requestKeys.get(key);
        const previous = current ? find(current.task_id) : findByIdempotency(key);
        if (current && !previous) return errorResponse("Idempotency-Key refers to a task outside retained browser-demo history", 410, {expired: true});
        if (previous) {
          const storedFingerprint = current?.fingerprint || JSON.stringify({ prompt: previous.objective, mode: previous.mode });
          if (storedFingerprint !== fingerprint) return errorResponse("Idempotency-Key was already used for a different request", 409);
          return duplicateResponse(previous);
        }
      }
      const task = demoTask(makeTaskId(), prompt, mode, { idempotencyKey: key });
      tasks.unshift(task);
      tasks.splice(25);
      registerKey(key, task, fingerprint);
      persist();
      return response({
        task_id: task.task_id, status: task.status, summary: task.summary,
        mode: task.mode, agents: task.agents, demo_only: true
      }, 202);
    }

    const streamMatch = path.match(/^\/api\/tasks\/([^/]+)\/stream$/);
    if (streamMatch && method === "GET") {
      const id = decodeURIComponent(streamMatch[1]);
      const task = find(id);
      return task ? streamResponse(task, readHeader(requestInit, "Last-Event-ID")) : errorResponse("Task not found", 404);
    }

    const recoveryMatch = path.match(/^\/api\/tasks\/([^/]+)\/recovery$/);
    if (recoveryMatch && method === "GET") {
      const id = decodeURIComponent(recoveryMatch[1]);
      const task = find(id);
      if (!task) return errorResponse("Task not found", 404);
      return response(recoveryGuidance(task));
    }

    const lineageMatch = path.match(/^\/api\/tasks\/([^/]+)\/lineage$/);
    if (lineageMatch && method === "GET") {
      const id = decodeURIComponent(lineageMatch[1]);
      const result = lineage(id);
      return result ? response(result) : errorResponse("Task not found", 404);
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)(?:\/(approve|cancel|retry))?$/);
    if (taskMatch) {
      const id = decodeURIComponent(taskMatch[1]);
      const action = taskMatch[2] || "";
      const task = find(id);
      if (!task) return errorResponse("Task not found", 404);
      if (!action && method === "GET") return response(task);
      if (action === "approve" && method === "POST") {
        if (task.status !== "AWAITING_APPROVAL") return errorResponse("Task is not awaiting approval", 409, { status: task.status });
        task.status = "COMPLETED";
        task.current_agent = "RELEASE";
        task.approval_required = false;
        task.artifacts = [
          { name: "service.py", language: "Python", size: "8.4 KB", type: "implementation" },
          { name: "test_service.py", language: "Python", size: "6.1 KB", type: "test suite" },
          { name: "cyrus.manifest.json", language: "JSON", size: "2.3 KB", type: "release manifest" }
        ];
        task.tests_passed = 18;
        task.tests_failed = 0;
        task.coverage = 92;
        task.failure = null;
        task.summary = "Operator approved the deterministic browser-demo release.";
        appendEvent(task, "ORCHESTRATOR", "APPROVED", "Operator approval received; browser-demo release state advanced.");
        persist();
        return response({ task_id: id, status: "APPROVAL_GRANTED", summary: "Demo approval recorded in this browser only." }, 202);
      }
      if (action === "cancel" && method === "POST") {
        if (!["RUNNING", "AWAITING_APPROVAL"].includes(task.status)) {
          return errorResponse("Only running or approval-pending tasks can be cancelled", 409, { status: task.status });
        }
        task.status = "CANCELLED";
        task.current_agent = task.current_agent || "ORCHESTRATOR";
        task.approval_required = false;
        task.summary = "CYRUS cancelled this browser-demo execution.";
        task.failure = { type: "DemoCancelled", message: "Operator cancelled the browser-demo record." };
        appendEvent(task, task.current_agent, "CANCELLED", "Execution marked cancelled by the demo operator.");
        persist();
        return response({ task_id: id, status: "CANCELLATION_REQUESTED", summary: "Demo cancellation recorded locally." }, 202);
      }
      if (action === "retry" && method === "POST") {
        if (!["FAILED", "CANCELLED", "TIMED_OUT"].includes(String(task.status || "").toUpperCase())) {
          return errorResponse("Only failed, cancelled, or timed-out tasks can be retried", 409, { status: task.status || "UNKNOWN" });
        }
        const retryNumber = clampInteger(task.retry_number, 0, 0, 1000000);
        const cap = effectiveRetryLimit(task);
        if (retryNumber >= cap) return errorResponse("The configured retry limit has been reached for this execution lineage", 409, {
          retry_number: retryNumber, max_task_retries: task.max_task_retries,
          effective_max_task_retries: cap
        });
        const nextRetry = retryNumber + 1;
        const key = readHeader(init, "Idempotency-Key");
        if (key && (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key))) return errorResponse("Idempotency-Key must be 1-128 safe characters", 400);
        const fingerprint = JSON.stringify({ prompt: task.objective, mode: task.mode, retry_of: task.task_id, retry_number: nextRetry });
        if (key) {
          const current = requestKeys.get(key);
          const previous = current ? find(current.task_id) : findByIdempotency(key);
          if (current && !previous) return errorResponse("Idempotency-Key refers to a task outside retained browser-demo history", 410, {expired: true});
          if (previous) {
            const stored = current?.fingerprint || JSON.stringify({
              prompt: previous.objective, mode: previous.mode,
              retry_of: previous.parent_task_id, retry_number: previous.retry_number
            });
            if (stored !== fingerprint) return errorResponse("Idempotency-Key was already used for a different request", 409);
            return duplicateResponse(previous, id);
          }
        }
        const existing = tasks.find((candidate) =>
          candidate.parent_task_id === id && clampInteger(candidate.retry_number, 0, 0, 1000000) === nextRetry
        );
        if (existing) {
          registerKey(key, existing, fingerprint);
          return duplicateResponse(existing, id);
        }
        const failureType = task.failure && typeof task.failure.type === "string" ? task.failure.type.slice(0, 80) : "";
        const retryReason = String(task.status).toUpperCase() + (failureType ? ":" + failureType : "");
        const retried = demoTask(makeTaskId(), task.objective, task.mode, {
          parentTaskId: id,
          retryNumber: nextRetry,
          retryReason,
          maxTaskRetries: task.max_task_retries,
          idempotencyKey: key
        });
        tasks.unshift(retried);
        tasks.splice(25);
        registerKey(key, retried, fingerprint);
        persist();
        return response({
          task_id: retried.task_id,
          status: retried.status,
          mode: retried.mode,
          retry_of: id,
          retry_number: retried.retry_number,
          max_task_retries: retried.max_task_retries,
          effective_max_task_retries: effectiveRetryLimit(retried),
          deduplicated: false,
          demo_only: true
        }, 202);
      }
      return errorResponse("Method or task action is not supported by the browser demo", 405);
    }

    return errorResponse("Demo endpoint not implemented", 404);
  };

  window.CYRUS_DEMO = Object.freeze({
    enabled: Boolean(window.CYRUS_CONFIG?.explicitDemoMode) ||
      window.CYRUS_CONFIG?.runtime === "browser-demo",
    version: "2",
    storageKey
  });
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input?.url || input);
    let isApi = false;
    try { isApi = new URL(rawUrl, window.location?.origin || "http://cyrus.local").pathname.startsWith("/api/"); }
    catch { isApi = rawUrl.includes("/api/"); }
    if (!isApi) return originalFetch(input, init);

    // Explicit demo mode is deterministic: never send its synthetic objective
    // to a remote backend and never depend on receiving a network exception.
    if (window.CYRUS_DEMO.enabled) return handleDemoRequest(input, init);
    try {
      return await originalFetch(input, init);
    } catch (error) {
      if (window.CYRUS_CONFIG?.apiBaseUrl) throw error;
      return handleDemoRequest(input, init);
    }
  };
})();