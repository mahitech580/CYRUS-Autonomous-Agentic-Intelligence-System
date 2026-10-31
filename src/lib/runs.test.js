import test from "node:test";
import assert from "node:assert/strict";
import { buildRunsCsv, filterRuns, mapRunRecord, mergeRunEvents, needsRunDetailRefresh } from "./runs.js";

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
  assert.ok(csv.includes('"'  +SUM(1,2)"'));
  assert.ok(csv.includes('"'@cmd"'));
  assert.ok(csv.includes('"'-1+1"'));
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
