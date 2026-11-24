import test from "node:test";
import assert from "node:assert/strict";
import { isRunCompleted, getRunStageState, getRunStageTiming, getRunPageOffset, normalizeActivityRunPage, normalizeRunHistoryPage, assertNoRunPageOverlap, getNextRunEventCursor, applyRunEventCursor, hasRunArtifacts, buildRunsCsv, buildRunActivity, mergeRunActivity, getCurrentRunActivity, isRunEventPage, filterRuns, getOrCreateRetryRequestKey, getOrCreateRunRequestKey, getRunRecordCount, mapRunRecord, mergeRunEvents, mergeRunPollResult, needsRunDetailRefresh, nextRunPollDelay, settleRunPoll, summarizeRunUsage, filterRunEvents, getRunEventStatuses } from "./runs.js";

const sample = [
  { id: "RUN-001", goal: "Build secure login", status: "review", progress: 100, execution_mode: "live-model", created_at: "2026-10-28T09:00:00Z" },
  { id: "RUN-002", goal: "Refactor reports", status: "running", progress: 45, execution_mode: "live-model" },
  { id: "RUN-003", goal: "Improve search", status: "failed", progress: 35, execution_mode: "live-model" },
  { id: "RUN-004", goal: "Approval gate", status: "approved", progress: 100, execution_mode: "live-model" },
];

test("filters workflow goals and identifiers case-insensitively", () => {
  assert.deepEqual(filterRuns(sample, "SECURE").map((run) => run.id), ["RUN-001"]);
  assert.deepEqual(filterRuns(sample, "run-00").map((run) => run.id), ["RUN-001", "RUN-002", "RUN-003", "RUN-004"]);
});

test("status filters distinguish active and failed workflows", () => {
  assert.deepEqual(filterRuns(sample, "", "running").map((run) => run.id), ["RUN-002"]);
  assert.deepEqual(filterRuns(sample, "", "failed").map((run) => run.id), ["RUN-003"]);
});

test("completed filter includes fully finished review and approved runs, not partial work", () => {
  assert.deepEqual(filterRuns(sample, "", "completed").map((run) => run.id), ["RUN-001", "RUN-004"]);
});

test("rejected decisions are filterable without being counted as completed", () => {
  const decisions = [
    { id: "RUN-APPROVED", status: "approved", approval_status: "approved", progress: 100 },
    { id: "RUN-REJECTED", status: "rejected", approval_status: "rejected", progress: 100 },
  ];
  assert.deepEqual(filterRuns(decisions, "", "rejected").map((run) => run.id), ["RUN-REJECTED"]);
  assert.deepEqual(filterRuns(decisions, "", "completed").map((run) => run.id), ["RUN-APPROVED"]);
});


test("combined search and status filters apply both constraints", () => {
  assert.deepEqual(filterRuns(sample, "approve", "approved").map((run) => run.id), ["RUN-004"]);
  assert.deepEqual(filterRuns(sample, "login", "failed"), []);
});

test("multi-term search combines goal, stage, decision and status metadata", () => {
  const records = [
    { id: "RUN-SEARCH-1", goal: "Build a Café dashboard", status: "failed", current_stage: "research", approval_status: "rejected" },
    { id: "RUN-SEARCH-2", goal: "Build a reporting API", status: "running", current_stage: "code", approval_status: "pending" },
  ];
  assert.deepEqual(filterRuns(records, "cafe failed").map((run) => run.id), ["RUN-SEARCH-1"]);
  assert.deepEqual(filterRuns(records, "research rejected").map((run) => run.id), ["RUN-SEARCH-1"]);
  assert.deepEqual(filterRuns(records, "reporting running").map((run) => run.id), ["RUN-SEARCH-2"]);
});

test("run search normalizes punctuation and ignores malformed records", () => {
  const records = [null, "invalid", { id: "RUN-SEARCH-3", goal: "Secure API / review" }];
  assert.deepEqual(filterRuns(records, "secure/api").map((run) => run.id), ["RUN-SEARCH-3"]);
  assert.deepEqual(filterRuns(records, "///"), [{ id: "RUN-SEARCH-3", goal: "Secure API / review" }]);
});

test("CSV export quotes commas, quotes and newlines and emits spreadsheet-friendly UTF-8", () => {
  const csv = buildRunsCsv([{ id: "RUN-005", goal: 'Build "auth", v2\nnow', status: "review", progress: 100 }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.includes('"Build ""auth"", v2 now"'));
  assert.equal(csv.split("\r\n").length, 3);
});

test("CSV export neutralizes spreadsheet formulas and normalizes carriage returns", () => {
  const csv = buildRunsCsv([
    { id: "RUN-CSV", goal: '=HYPERLINK("https://attacker.test","open")\rnext', status: "review", progress: 100 },
    { id: "RUN-CSV-2", goal: "  +SUM(1,2)", status: "review", progress: 100 },
    { id: "RUN-CSV-3", goal: "@cmd", status: "review", progress: 100 },
    { id: "RUN-CSV-4", goal: "-1+1", status: "review", progress: 100 },
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://attacker.test"",""open"") next"'));
  assert.ok(csv.includes(`"'  +SUM(1,2)"`));
  assert.ok(csv.includes(`"'@cmd"`));
  assert.ok(csv.includes(`"'-1+1"`));
});


test("CSV export has a header even for an empty workflow list", () => {
  const csv = buildRunsCsv([]);
  assert.ok(csv.startsWith("\uFEFFid,goal,status,progress"));
  assert.equal(csv.split("\r\n").length, 2);
});

test("run mapping labels live AI and preserves invalid timestamps without inventing recency", () => {
  const mapped = mapRunRecord({ id: "RUN-006", execution_mode: "live-model", created_at: "not-a-date" });
  assert.equal(mapped.kind, "Live AI workflow");
  assert.equal(mapped.time, "not-a-date");
  assert.equal(mapped.agents, undefined);
  assert.equal(mapRunRecord({ id: "RUN-007" }).time, "Time unavailable");
});

test("incremental event merge deduplicates IDs and preserves event order", () => {
  const existing = [{ id: "a", message: "first" }, { id: "b", message: "second" }];
  const merged = mergeRunEvents(existing, [{ id: "b", message: "updated" }, { id: "c", message: "third" }]);
  assert.deepEqual(merged.map((event) => event.id), ["a", "b", "c"]);
  assert.equal(merged[1].message, "updated");
});

test("expired event cursor replaces stale history instead of duplicating it", () => {
  const merged = mergeRunEvents([{ id: "old" }], [{ id: "fresh" }], true);
  assert.deepEqual(merged, [{ id: "fresh" }]);
});

test("late event pages preserve newer records and restore persisted chronology", () => {
  const current = [{ id: "event-newer", at: "2026-11-24T10:02:00Z" }];
  const late = [{ id: "event-older", at: "2026-11-24T10:01:00Z" }];
  assert.deepEqual(
    mergeRunEvents(current, late).map((event) => event.id),
    ["event-older", "event-newer"],
  );
  assert.deepEqual(
    mergeRunEvents(current, late, true).map((event) => event.id),
    ["event-older", "event-newer"],
  );
  assert.deepEqual(mergeRunEvents(current, [], true), current);
});

test("incremental event history remains within the backend retention window", () => {
  const existing = Array.from({ length: 249 }, (_, index) => ({ id: "event-" + index }));
  const merged = mergeRunEvents(existing, [{ id: "event-249" }, { id: "event-250" }]);
  assert.equal(merged.length, 250);
  assert.equal(merged[0].id, "event-1");
  assert.equal(merged.at(-1).id, "event-250");
});


test("run polling retry delay grows exponentially and is capped", () => {
  assert.equal(nextRunPollDelay(0), 2500);
  assert.equal(nextRunPollDelay(1), 5000);
  assert.equal(nextRunPollDelay(2), 10000);
  assert.equal(nextRunPollDelay(3), 20000);
  assert.equal(nextRunPollDelay(4), 30000);
  assert.equal(nextRunPollDelay(100), 30000);
  assert.equal(nextRunPollDelay("invalid"), 2500);
});


test("run polling keeps a successful status when the event request fails", () => {
  const result = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-1", status: "running" } } },
    { status: "rejected", reason: new Error("temporary event failure") },
  );
  assert.equal(result.status.status, "running");
  assert.equal(result.statusOk, true);
  assert.equal(result.events, null);
  assert.equal(result.eventsOk, false);
});

test("run polling reports event success independently from status success", () => {
  const events = { items: [{ id: "event-1" }], next_after: "event-1" };
  const result = settleRunPoll(
    { status: "rejected", reason: new Error("temporary status failure") },
    { status: "fulfilled", value: events },
  );
  assert.equal(result.status, null);
  assert.equal(result.statusOk, false);
  assert.deepEqual(result.events, events);
  assert.equal(result.eventsOk, true);
});


test("run polling merges successful events when status polling fails", async () => {
  const { mergeRunPollResult } = await import("./runs.js");
  const current = {
    id: "RUN-PARTIAL",
    status: "running",
    progress: 35,
    stages: [{ id: "plan", output: "Existing artifact" }],
    events: [{ id: "event-old", message: "Existing event" }],
  };
  const eventsOnly = mergeRunPollResult(current, {
    status: null,
    statusOk: false,
    events: { items: [{ id: "event-new", message: "New event" }], next_after: "event-new" },
    eventsOk: true,
  });
  assert.equal(eventsOnly.status, "running");
  assert.equal(eventsOnly.progress, 35);
  assert.deepEqual(eventsOnly.events.map((event) => event.id), ["event-old", "event-new"]);
  assert.deepEqual(eventsOnly.stages, current.stages);

  const statusOnly = mergeRunPollResult(current, {
    status: { id: "RUN-PARTIAL", status: "review", progress: 100 },
    statusOk: true,
    events: null,
    eventsOk: false,
  });
  assert.equal(statusOnly.status, "review");
  assert.equal(statusOnly.progress, 100);
  assert.deepEqual(statusOnly.events, current.events);

  assert.equal(mergeRunPollResult(current, {
    status: null, statusOk: false, events: null, eventsOk: false,
  }), null);
});

test("late run polls cannot regress newer decisions or replace newer artifacts", () => {
  const current = {
    id: "RUN-STALE-POLL",
    status: "approved",
    approval_status: "approved",
    progress: 100,
    updated_at: "2026-11-24T10:02:00Z",
    stages: [{ id: "plan", output: "Latest saved artifact" }],
    events: [
      { id: "event-start", at: "2026-11-24T10:00:00Z" },
      { id: "event-approval", at: "2026-11-24T10:02:00Z" },
    ],
  };
  const poll = settleRunPoll(
    {
      status: "fulfilled",
      value: { item: {
        id: current.id,
        status: "review",
        progress: 100,
        updated_at: "2026-11-24T10:01:00Z",
      } },
    },
    {
      status: "fulfilled",
      value: {
        items: [{ id: "event-review", at: "2026-11-24T10:01:00Z" }],
        next_after: "event-review",
        cursor_expired: true,
      },
    },
    current.id,
  );
  const merged = mergeRunPollResult(current, poll, {
    id: current.id,
    status: "review",
    updated_at: "2026-11-24T10:01:00Z",
    stages: [{ id: "plan", output: "Stale artifact" }],
  });

  assert.equal(merged.status, "approved");
  assert.equal(merged.approval_status, "approved");
  assert.equal(merged.progress, 100);
  assert.deepEqual(merged.stages, current.stages);
  assert.deepEqual(merged.events.map((event) => event.id), [
    "event-start",
    "event-review",
    "event-approval",
  ]);
});

test("terminal run states win equal-timestamp polls without a newer persisted version", () => {
  const current = {
    id: "RUN-TERMINAL-POLL",
    status: "cancelled",
    updated_at: "2026-11-24T10:02:00Z",
  };
  const poll = settleRunPoll(
    { status: "fulfilled", value: { item: {
      id: current.id, status: "running", updated_at: current.updated_at,
    } } },
    { status: "rejected", reason: new Error("event history unavailable") },
    current.id,
  );
  assert.equal(mergeRunPollResult(current, poll).status, "cancelled");
});

test("run polling rejects fulfilled but malformed status and event payloads", () => {
  const malformedStatus = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-1" } } },
    { status: "fulfilled", value: { items: [] } },
  );
  assert.equal(malformedStatus.status, null);
  assert.equal(malformedStatus.statusOk, false);
  assert.equal(malformedStatus.eventsOk, true);

  const malformedEvents = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-1", status: "running" } } },
    { status: "fulfilled", value: { items: "not-an-array", next_after: 42 } },
  );
  assert.equal(malformedEvents.status.status, "running");
  assert.equal(malformedEvents.statusOk, true);
  assert.equal(malformedEvents.events, null);
  assert.equal(malformedEvents.eventsOk, false);

  const arrayPayload = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-1", status: "running" } } },
    { status: "fulfilled", value: [] },
  );
  assert.equal(arrayPayload.eventsOk, false);
});

test("run polling rejects cross-run status and detail payloads", () => {
  const current = {
    id: "RUN-EXPECTED",
    status: "running",
    progress: 25,
    stages: [{ id: "plan", output: "Expected run artifact" }],
    events: [{ id: "event-old", message: "Existing event" }],
  };
  const mismatchedStatus = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-OTHER", status: "failed", progress: 100 } } },
    { status: "rejected", reason: new Error("temporary event failure") },
    current.id,
  );
  assert.equal(mismatchedStatus.statusOk, false);
  assert.equal(mergeRunPollResult(current, mismatchedStatus), null);

  const eventsOnly = settleRunPoll(
    { status: "fulfilled", value: { item: { id: "RUN-OTHER", status: "failed", progress: 100 } } },
    { status: "fulfilled", value: { items: [{ id: "event-new", message: "Expected run event" }], next_after: "event-new" } },
    current.id,
  );
  const eventMerge = mergeRunPollResult(current, eventsOnly, {
    id: "RUN-OTHER",
    stages: [{ id: "code", output: "Wrong run artifact" }],
  });
  assert.equal(eventMerge.id, current.id);
  assert.equal(eventMerge.status, "running");
  assert.equal(eventMerge.progress, 25);
  assert.deepEqual(eventMerge.stages, current.stages);
  assert.deepEqual(eventMerge.events.map((event) => event.id), ["event-old", "event-new"]);

  const statusOnly = settleRunPoll(
    { status: "fulfilled", value: { item: { id: current.id, status: "review", progress: 100 } } },
    { status: "rejected", reason: new Error("temporary event failure") },
    current.id,
  );
  const statusMerge = mergeRunPollResult(current, statusOnly, {
    id: "RUN-OTHER",
    stages: [{ id: "code", output: "Wrong run artifact" }],
  });
  assert.equal(statusMerge.status, "review");
  assert.deepEqual(statusMerge.stages, current.stages);
});

test("run polling rejects event pages with malformed IDs or mismatched cursors", () => {
  const statusFailure = { status: "rejected", reason: new Error("status unavailable") };
  const mismatchedCursor = settleRunPoll(statusFailure, {
    status: "fulfilled",
    value: { items: [{ id: "event-one" }], next_after: "event-two" },
  });
  assert.equal(mismatchedCursor.eventsOk, false);

  const missingIdentity = settleRunPoll(statusFailure, {
    status: "fulfilled",
    value: { items: [{ message: "No stable event ID" }], next_after: "event-one" },
  });
  assert.equal(missingIdentity.eventsOk, false);

  const staleExpiredCursor = settleRunPoll(statusFailure, {
    status: "fulfilled",
    value: { items: [], next_after: "event-old", cursor_expired: true },
  });
  assert.equal(staleExpiredCursor.eventsOk, false);

  const validExpiredReset = settleRunPoll(statusFailure, {
    status: "fulfilled",
    value: { items: [], next_after: null, cursor_expired: true },
  });
  assert.equal(validExpiredReset.eventsOk, true);

  const validPage = settleRunPoll(statusFailure, {
    status: "fulfilled",
    value: { items: [{ id: "event-one" }, { id: "event-two" }], next_after: "event-two" },
  });
  assert.equal(validPage.eventsOk, true);
});

test("run detail refresh is requested only when new stages are persisted", () => {
  assert.equal(needsRunDetailRefresh(1, 0), true);
  assert.equal(needsRunDetailRefresh(2, 2), false);
  assert.equal(needsRunDetailRefresh(undefined, 0), false);
  assert.equal(needsRunDetailRefresh("invalid", 0), false);
});

test("failed-workflow retries keep independent idempotency keys per source run", () => {
  const holder = { current: new Map() };
  let generated = 0;
  const createKey = () => "retry-key-" + (++generated);

  const first = getOrCreateRetryRequestKey(holder, "RUN-FAILED-1", createKey);
  const replay = getOrCreateRetryRequestKey(holder, "RUN-FAILED-1", createKey);
  const otherRun = getOrCreateRetryRequestKey(holder, "RUN-FAILED-2", createKey);

  assert.equal(first, replay);
  assert.notEqual(first, otherRun);
  assert.equal(generated, 2);
  holder.current.delete("RUN-FAILED-1");
  assert.notEqual(getOrCreateRetryRequestKey(holder, "RUN-FAILED-1", createKey), first);
});


test("workflow creation reuses an idempotency key after an ambiguous request failure", () => {
  const holder = { current: null };
  let generated = 0;
  const createKey = () => "request-key-" + (++generated);

  const firstAttempt = getOrCreateRunRequestKey(holder, "Build a reliable workflow", createKey);
  const retryAttempt = getOrCreateRunRequestKey(holder, "Build a reliable workflow", createKey);
  const changedGoal = getOrCreateRunRequestKey(holder, "Build a different workflow", createKey);

  assert.equal(firstAttempt, retryAttempt);
  assert.notEqual(firstAttempt, changedGoal);
  assert.equal(generated, 2);
});


test("run insertion replaces an idempotent replay without duplicating history", async () => {
  const { prependRunRecord } = await import("./runs.js");
  const current = [{ id: "RUN-1", goal: "Old summary" }, { id: "RUN-2" }];
  const replay = { id: "RUN-1", goal: "Updated summary" };
  const merged = prependRunRecord(current, replay);
  assert.deepEqual(merged, [replay, current[1]]);
  assert.equal(merged.filter((run) => run.id === "RUN-1").length, 1);
  assert.deepEqual(prependRunRecord(current, null), current);
});

test("run aggregate refresh is required when active work reaches a terminal state", async () => {
  const { shouldRefreshRunAggregates } = await import("./runs.js");
  assert.equal(shouldRefreshRunAggregates("queued", "running"), false);
  assert.equal(shouldRefreshRunAggregates("running", "review"), true);
  assert.equal(shouldRefreshRunAggregates("queued", "cancelled"), true);
  assert.equal(shouldRefreshRunAggregates("running", "failed"), true);
  assert.equal(shouldRefreshRunAggregates("failed", "review"), false);
  assert.equal(shouldRefreshRunAggregates("review", "approved"), false);
});

test("run insertion updates pagination without inflating totals on an idempotent replay", async () => {
  const { getRunInsertionChanges } = await import("./runs.js");
  const current = [{ id: "RUN-OLD" }];
  const incoming = { id: "RUN-NEW" };

  const created = getRunInsertionChanges(current, incoming, false);
  assert.deepEqual(created.items, [incoming, current[0]]);
  assert.equal(created.offsetDelta, 1);
  assert.equal(created.totalDelta, 1);

  const replayed = getRunInsertionChanges(current, incoming, true);
  assert.deepEqual(replayed.items, [incoming, current[0]]);
  assert.equal(replayed.offsetDelta, 1);
  assert.equal(replayed.totalDelta, 0);

  const alreadyLoaded = getRunInsertionChanges([incoming, current[0]], incoming, true);
  assert.equal(alreadyLoaded.offsetDelta, 0);
  assert.equal(alreadyLoaded.totalDelta, 0);
  assert.deepEqual(getRunInsertionChanges(current, null), {
    items: current, offsetDelta: 0, totalDelta: 0,
  });
});

test("run stage state distinguishes completed, active, failed and not-reached stages", () => {
  const run = {
    status: "failed",
    current_stage: null,
    stages: [{ id: "plan", status: "completed" }],
    events: [{ id: "failure-1", stage: "research", agent: "Scout", status: "failed" }],
  };
  assert.equal(getRunStageState(run, "plan"), "completed");
  assert.equal(getRunStageState(run, "research"), "failed");
  assert.equal(getRunStageState(run, "architect"), "queued");
  assert.equal(getRunStageState({ status: "running", current_stage: "test" }, "test"), "active");
  assert.equal(getRunStageState(null, "plan"), "queued");
});


test("workflow search includes stage, approval, execution mode and failure context", () => {
  const enriched = [
    { id: "RUN-STAGE", goal: "Build feature", status: "running", current_stage: "architect", approval_status: "pending", execution_mode: "live-model" },
    { id: "RUN-ERROR", goal: "Repair API", status: "failed", error: "Provider timeout during research" },
  ];
  assert.deepEqual(filterRuns(enriched, "architect").map((run) => run.id), ["RUN-STAGE"]);
  assert.deepEqual(filterRuns(enriched, "pending").map((run) => run.id), ["RUN-STAGE"]);
  assert.deepEqual(filterRuns(enriched, "live-model").map((run) => run.id), ["RUN-STAGE"]);
  assert.deepEqual(filterRuns(enriched, "provider timeout").map((run) => run.id), ["RUN-ERROR"]);
});

test("token summaries use only loaded details and reject invalid or negative counts", () => {
  const summary = summarizeRunUsage([
    { id: "RUN-SUMMARY", stage_count: 7 },
    { id: "RUN-DETAIL", stages: [
      { usage: { input_tokens: 12.8, output_tokens: 4 } },
      { usage: { input_tokens: -3, output_tokens: "9" } },
      { usage: { input_tokens: Infinity, output_tokens: "NaN" } },
    ] },
  ]);
  assert.deepEqual(summary, {
    inputTokens: 12,
    outputTokens: 13,
    detailedRunCount: 1,
    stageUsageCount: 2,
    hasUsage: true,
  });
  assert.equal(summarizeRunUsage([{ stage_count: 4 }]).hasUsage, false);
});


test("run mapping does not mislabel the configured specialist roster as per-run agent usage", () => {
  assert.equal(mapRunRecord({ agent_count: 0 }).agents, undefined);
  assert.equal(mapRunRecord({ agent_count: "3.9" }).agents, undefined);
  assert.equal(mapRunRecord({ agent_count: null }).agents, undefined);
  assert.equal(mapRunRecord({ agent_count: "unknown" }).agents, undefined);
});

test("run record counts accept only non-negative safe integers", () => {
  assert.equal(getRunRecordCount(0), 0);
  assert.equal(getRunRecordCount("3"), 3);
  assert.equal(getRunRecordCount(3.0), 3);
  assert.equal(getRunRecordCount(3.2), null);
  assert.equal(getRunRecordCount(-1), null);
  assert.equal(getRunRecordCount("unknown"), null);
  assert.equal(getRunRecordCount(" "), null);
  assert.equal(getRunRecordCount(null), null);
  assert.equal(getRunRecordCount(undefined), null);
  assert.equal(getRunRecordCount(true), null);
});


test("run helpers safely ignore malformed entries from an API payload", () => {
  const mixed = [null, undefined, "invalid", 42, ...sample];
  assert.deepEqual(filterRuns(mixed, "secure").map((run) => run.id), ["RUN-001"]);
  const csv = buildRunsCsv([null, "invalid", ...sample]);
  assert.ok(csv.includes("RUN-001"));
  assert.ok(csv.includes("RUN-004"));
  assert.equal(csv.split("\r\n").length, sample.length + 2);
});

test("artifact availability uses lightweight run summaries without requiring payloads", () => {
  assert.equal(hasRunArtifacts({ stage_count: 3 }), true);
  assert.equal(hasRunArtifacts({ stage_count: 0, stages: [{ id: "plan" }] }), false);
  assert.equal(hasRunArtifacts({ stages: [{ id: "plan" }] }), true);
  assert.equal(hasRunArtifacts({ stage_count: "invalid", stages: [] }), false);
  assert.equal(hasRunArtifacts(null), false);
});

test("history pagination advances locally when the server cursor is null", () => {
  assert.equal(getRunPageOffset({ next_offset: 30 }, 0, 30), 30);
  assert.equal(getRunPageOffset({ next_offset: null }, 0, 4), 4);
  assert.equal(getRunPageOffset({}, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: "invalid" }, -4, -2), 0);
});


test("stage timing uses persisted start and terminal events and handles interrupted work", () => {
  const run = {
    status: "review",
    events: [
      { stage: "plan", status: "started", at: "2026-11-11T10:00:00.000Z" },
      { stage: "plan", status: "completed", at: "2026-11-11T10:00:02.500Z" },
      { stage: "research", status: "started", at: "2026-11-11T10:00:03.000Z" },
      { stage: "research", status: "failed", at: "2026-11-11T10:00:07.000Z" },
    ],
  };
  assert.deepEqual(getRunStageTiming(run, "plan", 0), { status: "completed", durationMs: 2500 });
  assert.deepEqual(getRunStageTiming(run, "research", 0), { status: "failed", durationMs: 4000 });
  const active = {
    status: "running",
    events: [{ stage: "build", status: "started", at: "2026-11-11T10:00:00.000Z" }],
  };
  assert.deepEqual(getRunStageTiming(active, "build", Date.parse("2026-11-11T10:00:09.000Z")), {
    status: "running",
    durationMs: 9000,
  });
  const interrupted = {
    status: "cancelled",
    updated_at: "2026-11-11T10:00:05.000Z",
    events: [{ stage: "test", status: "started", at: "2026-11-11T10:00:00.000Z" }],
  };
  assert.deepEqual(getRunStageTiming(interrupted, "test", 0), { status: "interrupted", durationMs: 5000 });
  assert.equal(getRunStageTiming(run, "release", 0), null);
});


test("run search preserves Indic dependent vowel signs while folding Latin accents", () => {
  const records = [
    { id: "TEL-1", goal: "కోడ్ విశ్లేషణ", status: "queued" },
    { id: "LAT-1", goal: "Cafe\u0301 reliability", status: "queued" }
  ];
  assert.deepEqual(filterRuns(records, "కోడ్").map((run) => run.id), ["TEL-1"]);
  assert.deepEqual(filterRuns(records, "cafe").map((run) => run.id), ["LAT-1"]);
});


test("workflow creation restores the same idempotency key after editing the goal away and back", () => {
  const holder = { current: null };
  let generated = 0;
  const createKey = () => "goal-key-" + (++generated);
  const first = getOrCreateRunRequestKey(holder, "Build a reliable workflow", createKey);
  const other = getOrCreateRunRequestKey(holder, "Build a different workflow", createKey);
  const restored = getOrCreateRunRequestKey(holder, "Build a reliable workflow", createKey);
  assert.equal(first, restored);
  assert.notEqual(first, other);
  assert.equal(generated, 2);
});

test("workflow creation bounds remembered idempotency keys for edited goals", () => {
  const holder = { current: null };
  let generated = 0;
  const createKey = () => "bounded-key-" + (++generated);
  const first = getOrCreateRunRequestKey(holder, "Goal 0", createKey);
  for (let index = 1; index <= 16; index += 1) {
    getOrCreateRunRequestKey(holder, "Goal " + index, createKey);
  }
  const recreated = getOrCreateRunRequestKey(holder, "Goal 0", createKey);
  assert.notEqual(first, recreated);
  assert.equal(holder.current.size, 16);
});


test("run goal validation matches backend trimmed minimum and maximum lengths", async () => {
  const { validateRunGoal } = await import("./runs.js");
  assert.match(validateRunGoal("   "), /Describe the engineering outcome/);
  assert.match(validateRunGoal("short"), /at least 8 characters/);
  assert.equal(validateRunGoal("  Build a robust workflow  "), "");
  assert.match(validateRunGoal("a".repeat(1201)), /1,200 characters or fewer/);
});

test("run goal validation counts Unicode code points rather than UTF-16 code units", async () => {
  const { validateRunGoal } = await import("./runs.js");
  assert.match(validateRunGoal("😀😀😀😀"), /at least 8 characters/);
  assert.equal(validateRunGoal("😀😀😀😀😀😀😀😀"), "");
});


test("run search includes stage and event details only when those details are loaded", () => {
  const detailed = [{
    id: "RUN-DETAIL-SEARCH",
    goal: "Prepare a service release",
    status: "review",
    stages: [{ id: "architect", agent: "Forma", role: "Architecture", summary: "Design a payment boundary", status: "completed" }],
    events: [{ id: "event-1", stage: "test", agent: "Sentinel", message: "Detected a retry race in webhook delivery", status: "failed" }]
  }];
  assert.deepEqual(filterRuns(detailed, "payment boundary").map((run) => run.id), ["RUN-DETAIL-SEARCH"]);
  assert.deepEqual(filterRuns(detailed, "webhook retry race").map((run) => run.id), ["RUN-DETAIL-SEARCH"]);
  assert.deepEqual(filterRuns([{ ...detailed[0], stages: undefined, events: undefined }], "webhook retry race"), []);
});

test("run search ignores malformed stage and event entries", () => {
  const records = [{
    id: "RUN-SAFE-SEARCH",
    goal: "Review deployment",
    stages: [null, "invalid", { agent: "Lens", summary: "Review access controls" }],
    events: [null, 42, { message: "Connection failed safely" }]
  }];
  assert.deepEqual(filterRuns(records, "access controls").map((run) => run.id), ["RUN-SAFE-SEARCH"]);
  assert.deepEqual(filterRuns(records, "connection failed").map((run) => run.id), ["RUN-SAFE-SEARCH"]);
});


test("refreshing run summaries updates an open drawer without dropping loaded details", async () => {
  const { mergeRunSummaryIntoDetail } = await import("./runs.js");
  const current = {
    id: "RUN-OPEN",
    status: "running",
    progress: 40,
    stages: [{ id: "plan", output: "Loaded planning artifact" }],
    events: [{ id: "event-1", message: "Loaded event" }],
    detail_loading: false
  };
  const summary = {
    id: "RUN-OPEN",
    status: "review",
    progress: 100,
    stage_count: 7,
    event_count: 23
  };
  const merged = mergeRunSummaryIntoDetail(current, summary);
  assert.equal(merged.status, "review");
  assert.equal(merged.progress, 100);
  assert.equal(merged.stage_count, 7);
  assert.equal(merged.event_count, 23);
  assert.deepEqual(merged.stages, current.stages);
  assert.deepEqual(merged.events, current.events);
  assert.equal(merged.detail_loading, false);
});

test("run summary merge ignores a different run and preserves active detail loading", async () => {
  const { mergeRunSummaryIntoDetail } = await import("./runs.js");
  const current = { id: "RUN-A", stages: [], events: [], detail_loading: true };
  assert.equal(mergeRunSummaryIntoDetail(current, { id: "RUN-B", status: "failed" }), current);
  const merged = mergeRunSummaryIntoDetail(current, { id: "RUN-A", status: "running" });
  assert.equal(merged.detail_loading, true);
});


test("persisted stage status takes precedence over artifact presence", () => {
  const run = {
    status: "running",
    current_stage: "test",
    stages: [
      { id: "plan", status: "failed", output: "partial plan artifact" },
      { id: "research", status: "running", output: "streamed research artifact" },
      { id: "architect", status: "queued" },
      { id: "code", output: "legacy artifact without a persisted status" },
      { id: "review", status: "error" },
    ],
    events: [],
  };
  assert.equal(getRunStageState(run, "plan"), "failed");
  assert.equal(getRunStageState(run, "research"), "active");
  assert.equal(getRunStageState(run, "architect"), "queued");
  assert.equal(getRunStageState(run, "code"), "completed");
  assert.equal(getRunStageState(run, "review"), "failed");
});


test("activity workflow pages validate offset, continuation and a stable server snapshot", () => {
  const snapshotAt = "2026-11-24T03:00:00+00:00";
  const first = normalizeActivityRunPage({
    items: [{ id: "RUN-1", status: "completed" }, { id: "RUN-2", status: "failed" }],
    total: 3,
    limit: 2,
    offset: 0,
    has_more: true,
    next_offset: 2,
    snapshot_at: snapshotAt,
  }, 0, 2);
  assert.equal(first.snapshotAt, snapshotAt);
  assert.equal(first.nextOffset, 2);
  assert.equal(first.hasMore, true);

  const last = normalizeActivityRunPage({
    items: [{ id: "RUN-3", status: "review" }],
    total: 3,
    limit: 2,
    offset: 2,
    has_more: false,
    next_offset: null,
    snapshot_at: snapshotAt,
  }, 2, 2, snapshotAt);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextOffset, null);

  assert.throws(() => normalizeActivityRunPage({
    items: [{ id: "RUN-3" }], total: 3, limit: 2, offset: 1,
    has_more: true, next_offset: 2, snapshot_at: snapshotAt,
  }, 2, 2), /inconsistent page metadata/);
  assert.throws(() => normalizeActivityRunPage({
    items: [{ id: "RUN-3" }], total: 3, limit: 2, offset: 2,
    has_more: true, next_offset: 3, snapshot_at: snapshotAt,
  }, 2, 2), /inconsistent next-page cursor/);
  assert.throws(() => normalizeActivityRunPage({
    items: [{ id: "RUN-3" }], total: 3, limit: 2, offset: 2,
    has_more: false, next_offset: null, snapshot_at: "invalid",
  }, 2, 2), /invalid snapshot timestamp/);
  assert.throws(() => normalizeActivityRunPage({
    items: [{ id: "RUN-3" }], total: 3, limit: 2, offset: 2,
    has_more: false, next_offset: null, snapshot_at: "2026-11-24T03:00:01+00:00",
  }, 2, 2, snapshotAt), /changed the snapshot/);
  assert.throws(() => normalizeActivityRunPage({
    items: [{ id: "RUN-3" }, { id: "RUN-3" }], total: 3, limit: 2, offset: 0,
    has_more: true, next_offset: 2, snapshot_at: snapshotAt,
  }, 0, 2), /duplicate workflow IDs/);
  assert.throws(() => normalizeActivityRunPage({
    items: [], total: 3, limit: 2, offset: 0,
    has_more: true, next_offset: 0, snapshot_at: snapshotAt,
  }, 0, 2), /empty non-terminal page/);
});

test("generic history pages reject snapshot total drift and offsets beyond the total", () => {
  const snapshotAt = "2026-11-24T03:00:00+00:00";
  const first = {
    items: [{ id: "RUN-1" }, { id: "RUN-2" }], total: 3, limit: 2, offset: 0,
    has_more: true, next_offset: 2, snapshot_at: snapshotAt,
  };
  assert.equal(normalizeRunHistoryPage(first, 0, 2).nextOffset, 2);
  const last = { ...first, items: [{ id: "RUN-3" }], offset: 2, has_more: false, next_offset: null };
  assert.equal(normalizeRunHistoryPage(last, 2, 2, snapshotAt, 3).hasMore, false);
  assert.throws(() => normalizeRunHistoryPage(last, 2, 2, snapshotAt, 4), /changed the total within the snapshot/);
  assert.throws(() => normalizeRunHistoryPage({ ...last, offset: 4, items: [] }, 4, 2, snapshotAt, 3), /inconsistent page metadata/);
  assert.throws(() => normalizeRunHistoryPage({ ...first, items: [] }, 0, 2), /empty non-terminal page/);
});

test("adjacent workflow pages reject duplicate identities instead of silently skipping records", () => {
  const incoming = [{ id: "RUN-2" }];
  assert.equal(assertNoRunPageOverlap([{ id: "RUN-1" }], incoming), incoming);
  assert.throws(() => assertNoRunPageOverlap([{ id: "RUN-1" }, { id: "RUN-2" }], incoming), /previously loaded workflow ID/);
  assert.throws(() => assertNoRunPageOverlap([], [{ id: " " }]), /previously loaded workflow ID/);
});

test("history pagination rejects stale and forward-skipping cursors", () => {
  assert.equal(getRunPageOffset({ next_offset: 0 }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: 30 }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: 45 }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: "45" }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: 45.5 }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: 60 }, 30, 15), 45);
  assert.equal(getRunPageOffset({ next_offset: "invalid" }, 30, 15), 45);
});


test("completed workflow semantics match the backend aggregate contract", () => {
  assert.equal(isRunCompleted({ status: "review", progress: 100 }), true);
  assert.equal(isRunCompleted({ status: "approved", progress: "100" }), true);
  assert.equal(isRunCompleted({ status: "completed", progress: 99 }), false);
  assert.equal(isRunCompleted({ status: "failed", progress: 100 }), false);
  assert.equal(isRunCompleted({ status: "review", progress: "unknown" }), false);
  assert.equal(isRunCompleted(null), false);
});


test("CSV export neutralizes formulas after Unicode whitespace prefixes", () => {
  const csv = buildRunsCsv([
    { id: "RUN-CSV-UNICODE-1", goal: "\u00a0=HYPERLINK(\"https://attacker.test\",\"open\")" },
    { id: "RUN-CSV-UNICODE-2", goal: "\u3000+SUM(1,2)" },
  ]);
  assert.ok(csv.includes('"\'\u00a0=HYPERLINK(""https://attacker.test"",""open"")"'));
  assert.ok(csv.includes('"\'\u3000+SUM(1,2)"'));
});


test("completed stage counts follow timeline state rather than raw artifact length", async () => {
  const { countCompletedRunStages } = await import("./runs.js");
  const run = {
    status: "failed",
    stages: [
      { id: "plan", status: "completed" },
      { id: "research", status: "running" },
      { id: "architect", status: "future-state" },
      { id: "code" },
    ],
    events: [{ id: "test-done", stage: "test", status: "completed" }],
  };
  assert.equal(countCompletedRunStages(run, [
    "plan", "research", "architect", "code", "test", "review", "release",
  ]), 3);
});

test("terminal workflows do not leave persisted running stages active", () => {
  const startedAt = "2026-11-16T10:00:00.000Z";
  const completedAt = "2026-11-16T10:00:12.000Z";
  const updatedAt = "2026-11-16T10:00:25.000Z";
  const failedRun = {
    status: "failed",
    updated_at: updatedAt,
    stages: [{ id: "code", status: "running" }],
    events: [{ id: "code-start", stage: "code", status: "started", at: startedAt }],
  };
  assert.equal(getRunStageState(failedRun, "code"), "interrupted");
  assert.deepEqual(getRunStageTiming(failedRun, "code"), {
    status: "interrupted", durationMs: 25000,
  });
  assert.deepEqual(getRunStageTiming({
    status: "queued",
    updated_at: updatedAt,
    events: [{ id: "stale-start", stage: "research", status: "started", at: startedAt }],
  }, "research"), {
    status: "interrupted", durationMs: 25000,
  });

  const completedRun = {
    status: "review",
    stages: [{ id: "plan", status: "completed", completed_at: completedAt }],
    events: [{ id: "plan-start", stage: "plan", status: "started", at: startedAt }],
  };
  assert.equal(getRunStageState(completedRun, "plan"), "completed");
  assert.deepEqual(getRunStageTiming(completedRun, "plan"), {
    status: "completed", durationMs: 12000,
  });

  assert.equal(getRunStageState({
    status: "running", stages: [{ id: "architect", status: "future-state" }],
  }, "architect"), "queued");
  assert.equal(getRunStageState({
    status: "review", events: [{ stage: "test", status: "started", at: startedAt }],
  }, "test"), "interrupted");
});

test("cancelled and lease-expired workflows distinguish interrupted stages from queued work", () => {
  const events = [
    { id: "event-started", stage: "code", status: "started" },
    { id: "event-finished", stage: "plan", status: "completed" },
  ];
  assert.equal(getRunStageState({ status: "cancelled", events }, "code"), "interrupted");
  assert.equal(getRunStageState({ status: "failed", events }, "code"), "interrupted");
  assert.equal(getRunStageState({ status: "cancelled", events }, "plan"), "completed");
  assert.equal(getRunStageState({ status: "cancelled", events }, "research"), "queued");
});


test("execution event search matches all terms across event identity and content fields", () => {
  const events = [
    {
      id: "event-research-1",
      at: "2026-11-18T08:00:00.000Z",
      stage: "research",
      agent: "Scout",
      status: "completed",
      message: "Fetched React Router documentation",
    },
    {
      id: "event-test-2",
      at: "2026-11-18T08:01:00.000Z",
      stage: "test",
      agent: "Sentinel",
      status: "failed",
      message: "Retry race found",
    },
    {
      id: "event-build-3",
      at: "2026-11-18T08:02:00.000Z",
      stage: "code",
      agent: "Forge",
      status: "completed",
      message: "Updated API client",
    },
  ];

  assert.deepEqual(filterRunEvents(events, "SCOUT react documentation").map((event) => event.id), ["event-research-1"]);
  assert.deepEqual(filterRunEvents(events, "event-test-2 08:01").map((event) => event.id), ["event-test-2"]);
  assert.deepEqual(filterRunEvents(events, "retry race", "FAILED").map((event) => event.id), ["event-test-2"]);
  assert.deepEqual(filterRunEvents(events, "", "completed").map((event) => event.id), ["event-research-1", "event-build-3"]);
});

test("execution event search preserves Indic marks and folds Latin accents", () => {
  const events = [
    { id: "event-cafe", agent: "Café", message: "Release notes prepared" },
    { id: "event-telugu", stage: "కోడ్", message: "విశ్లేషణ పూర్తయింది" },
  ];
  assert.deepEqual(filterRunEvents(events, "cafe").map((event) => event.id), ["event-cafe"]);
  assert.deepEqual(filterRunEvents(events, "కోడ్").map((event) => event.id), ["event-telugu"]);
});

test("execution event filters ignore malformed entries, normalize statuses and preserve source order", () => {
  const events = [
    { id: "event-old", status: " FAILED ", message: "First" },
    null,
    "invalid",
    42,
    [],
    { id: "event-info", status: "info", message: "Second" },
    { id: "event-default", status: " ", message: "Third" },
  ];
  assert.deepEqual(filterRunEvents(events).map((event) => event.id), [
    "event-old", "event-info", "event-default",
  ]);
  assert.deepEqual(filterRunEvents(events, "", "failed").map((event) => event.id), ["event-old"]);
  assert.deepEqual(getRunEventStatuses(events), ["failed", "info"]);
  assert.deepEqual(filterRunEvents(null), []);
  assert.deepEqual(events.map((event) => event?.id ?? null), [
    "event-old", null, null, null, null, "event-info", "event-default",
  ]);
});

test("execution event filters require every query term and safely handle empty filters", () => {
  const events = [
    { id: "event-1", stage: "review", agent: "Lens", message: "Security boundary checked" },
    { id: "event-2", stage: "review", agent: "Lens", message: "API contract checked" },
  ];
  assert.deepEqual(filterRunEvents(events, "review security").map((event) => event.id), ["event-1"]);
  assert.deepEqual(filterRunEvents(events, "review missing"), []);
  assert.deepEqual(filterRunEvents(events, "   ", "all").map((event) => event.id), ["event-1", "event-2"]);
});


test("run event polling clears a stale cursor only when an expired window is empty", () => {
  assert.equal(getNextRunEventCursor({
    items: [],
    cursor_expired: true,
    next_after: null,
  }, "event-previous"), "");
  assert.equal(getNextRunEventCursor({
    items: [{ id: "event-recovered" }],
    cursor_expired: true,
    next_after: "event-recovered",
  }, "event-previous"), "event-recovered");
  assert.equal(getNextRunEventCursor({
    items: [],
    cursor_expired: false,
    next_after: "event-previous",
  }, "event-previous"), "event-previous");
  assert.equal(getNextRunEventCursor({
    items: [],
    cursor_expired: false,
    next_after: null,
  }, "event-previous"), "event-previous");
});

test("poll cursor application treats empty strings as explicit resets", () => {
  assert.equal(applyRunEventCursor("event-expired", ""), "");
  assert.equal(applyRunEventCursor("event-old", "event-new"), "event-new");
  assert.equal(applyRunEventCursor("event-old", null), "event-old");
});


test("global activity merges retained events newest-first and scopes event identity to each run", () => {
  const activity = buildRunActivity([
    {
      runId: "RUN-1",
      goal: "Build a secure API",
      status: "running",
      events: [
        { id: "same", at: "2026-11-20T10:00:00Z", stage: "plan", agent: "Atlas", status: "started", message: "Planning" },
        { id: "older", at: "2026-11-20T09:00:00Z", status: "completed", message: "Earlier stage" },
        { id: "same", at: "2026-11-20T10:01:00Z", status: "completed", message: "Updated planning" },
        { status: "info", message: "Missing event identity" },
      ],
    },
    {
      runId: "RUN-2",
      goal: "Investigate incident",
      status: "failed",
      events: [
        { id: "same", at: "2026-11-20T10:02:00Z", status: "failed", message: "Failure" },
        { id: "unknown-time", at: "not-a-date", status: "info", message: "No timestamp" },
      ],
    },
    null,
    { runId: "", events: [{ id: "ignored", at: "2026-11-20T10:03:00Z" }] },
  ], 10);
  assert.deepEqual(activity.map((item) => item.runId + ":" + item.id), [
    "RUN-2:same",
    "RUN-1:same",
    "RUN-1:older",
    "RUN-2:unknown-time",
  ]);
  assert.equal(activity[1].message, "Updated planning");
  assert.equal(activity[0].goal, "Investigate incident");
  assert.equal(activity[3].timestamp, null);
});

test("global activity search includes run goals and identifiers", () => {
  const activity = buildRunActivity([{
    runId: "RUN-SEARCH",
    goal: "Investigate payment timeout",
    status: "failed",
    events: [{ id: "evt-1", at: "2026-11-20T10:00:00Z", status: "failed", message: "Worker stopped" }],
  }]);
  assert.deepEqual(filterRunEvents(activity, "payment timeout").map((item) => item.id), ["evt-1"]);
  assert.deepEqual(filterRunEvents(activity, "RUN-SEARCH").map((item) => item.id), ["evt-1"]);
  assert.deepEqual(filterRunEvents(activity, "payment", "completed"), []);
});

test("global activity output is capped even when a caller requests an excessive limit", () => {
  const events = Array.from({ length: 205 }, (_, index) => ({
    id: "event-" + index,
    at: new Date(1760000000000 + index * 1000).toISOString(),
    status: "info",
  }));
  const activity = buildRunActivity([{ runId: "RUN-LARGE", events }], 999);
  assert.equal(activity.length, 200);
});


test("partial activity refresh replaces successful runs, preserves failed runs and drops removed runs", () => {
  const existing = buildRunActivity([
    { runId: "RUN-1", goal: "Old goal", status: "running", events: [
      { id: "old-1", at: "2026-11-21T09:00:00Z", status: "started", message: "Old event" },
    ] },
    { runId: "RUN-2", goal: "Keep this run", status: "running", events: [
      { id: "keep-1", at: "2026-11-21T09:01:00Z", status: "info", message: "Last known good" },
    ] },
    { runId: "RUN-3", goal: "Removed run", status: "completed", events: [
      { id: "drop-1", at: "2026-11-21T09:02:00Z", status: "completed", message: "Must disappear" },
    ] },
  ]);
  const merged = mergeRunActivity(existing, [{
    runId: "RUN-1", goal: "New goal", status: "completed", events: [
      { id: "new-1", at: "2026-11-21T09:03:00Z", status: "completed", message: "Fresh event" },
    ],
  }], ["RUN-1", "RUN-2"]);
  assert.deepEqual(merged.map((event) => event.runId + ":" + event.id), [
    "RUN-1:new-1", "RUN-2:keep-1",
  ]);
  assert.equal(merged.find((event) => event.runId === "RUN-2").message, "Last known good");
  assert.equal(merged.some((event) => event.id === "old-1" || event.id === "drop-1"), false);
});

test("workspace activity hides stale run sets and uses current run metadata", () => {
  const events = buildRunActivity([{
    runId: "RUN-CURRENT", goal: "Old goal", status: "running", events: [
      { id: "event-1", at: "2026-11-21T10:00:00Z", status: "info", message: "Current event" },
    ],
  }]);
  const key = JSON.stringify(["RUN-CURRENT"]);
  assert.deepEqual(getCurrentRunActivity(events, key, JSON.stringify(["RUN-OTHER"]), [
    { id: "RUN-OTHER", goal: "Other", status: "failed" },
  ]), []);
  const current = getCurrentRunActivity(events, key, key, [
    { id: "RUN-CURRENT", goal: "Updated goal", status: "completed" },
  ]);
  assert.equal(current.length, 1);
  assert.equal(current[0].goal, "Updated goal");
  assert.equal(current[0].runStatus, "completed");
  assert.deepEqual(getCurrentRunActivity(events, key, key, []), []);
});


test("event page validation rejects malformed records and broken cursor metadata", () => {
  assert.equal(isRunEventPage({
    items: [], total: 0, next_after: null, has_more: false, cursor_expired: false,
  }), true);
  assert.equal(isRunEventPage({
    items: [{ id: "event-1", status: "completed" }],
    total: 1, next_after: "event-1", has_more: false, cursor_expired: false,
  }), true);
  assert.equal(isRunEventPage({ items: [], total: 0, next_after: null, has_more: true, cursor_expired: false }), false);
  assert.equal(isRunEventPage({ items: [{ id: " " }], total: 1, next_after: " ", has_more: false, cursor_expired: false }), false);
  assert.equal(isRunEventPage({ items: [{ id: "event-1" }], total: 1, next_after: "event-2", has_more: false, cursor_expired: false }), false);
  assert.equal(isRunEventPage({ items: [], total: "0", next_after: null, has_more: false, cursor_expired: false }), false);
  assert.equal(isRunEventPage(null), false);
});
