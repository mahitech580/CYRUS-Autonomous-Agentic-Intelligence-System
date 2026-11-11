import test from "node:test";
import assert from "node:assert/strict";
import { getRunStageState, getRunStageTiming, getRunPageOffset, hasRunArtifacts, buildRunsCsv, filterRuns, getOrCreateRetryRequestKey, getOrCreateRunRequestKey, mapRunRecord, mergeRunEvents, needsRunDetailRefresh, nextRunPollDelay, settleRunPoll } from "./runs.js";

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

test("combined search and status filters apply both constraints", () => {
  assert.deepEqual(filterRuns(sample, "approve", "approved").map((run) => run.id), ["RUN-004"]);
  assert.deepEqual(filterRuns(sample, "login", "failed"), []);
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

test("run mapping labels live AI and handles invalid timestamps", () => {
  const mapped = mapRunRecord({ id: "RUN-006", execution_mode: "live-model", created_at: "not-a-date" });
  assert.equal(mapped.kind, "Live AI workflow");
  assert.equal(mapped.time, "not-a-date");
  assert.equal(mapped.agents, 7);
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

test("run mapping preserves a real zero-agent count and normalizes numeric counts", () => {
  assert.equal(mapRunRecord({ agent_count: 0 }).agents, 0);
  assert.equal(mapRunRecord({ agent_count: "3.9" }).agents, 3);
  assert.equal(mapRunRecord({ agent_count: null }).agents, 7);
  assert.equal(mapRunRecord({ agent_count: "unknown" }).agents, 7);
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
