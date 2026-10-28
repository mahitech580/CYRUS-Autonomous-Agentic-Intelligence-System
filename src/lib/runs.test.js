import test from "node:test";
import assert from "node:assert/strict";
import { buildRunsCsv, filterRuns, mapRunRecord } from "./runs.js";

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
