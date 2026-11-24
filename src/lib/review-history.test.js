import assert from "node:assert/strict";
import test from "node:test";
import {
  filterReviewHistory,
  getReviewDecision,
  mergeReviewHistoryRecords,
  mergeReviewHistoryRefresh,
  normalizeReviewHistoryPage,
} from "./review-history.js";

test("review decisions accept only persisted approved and rejected states", () => {
  assert.equal(getReviewDecision({ status: "approved" }), "approved");
  assert.equal(getReviewDecision({ approval_status: "rejected" }), "rejected");
  assert.equal(getReviewDecision({ status: "completed", approval_status: "pending" }), null);
  assert.equal(getReviewDecision(null), null);
  assert.equal(getReviewDecision([]), null);
});

test("review-history pages validate the complete status, offset, cursor and snapshot contract", () => {
  const response = {
    total: 3,
    limit: 2,
    offset: 0,
    has_more: true,
    next_offset: 2,
    snapshot_at: "2026-11-23T12:00:00+00:00",
    items: [
      { id: "RUN-1", status: "approved" },
      { id: "RUN-2", approval_status: "approved", status: "completed" },
    ],
  };
  const page = normalizeReviewHistoryPage(response, "approved", 0, 2);
  assert.equal(page.total, 3);
  assert.equal(page.pageLength, 2);
  assert.equal(page.snapshotAt, response.snapshot_at);
  assert.equal(page.nextOffset, 2);
  assert.deepEqual(page.items.map((item) => item.id), ["RUN-1", "RUN-2"]);
  assert.throws(() => normalizeReviewHistoryPage({ ...response, total: "3" }, "approved", 0, 2), /inconsistent pagination/);
  assert.throws(() => normalizeReviewHistoryPage({ ...response, offset: 1 }, "approved", 0, 2), /inconsistent pagination/);
  assert.throws(() => normalizeReviewHistoryPage({ ...response, next_offset: 3 }, "approved", 0, 2), /inconsistent next-page cursor/);
  assert.throws(() => normalizeReviewHistoryPage(response, "approved", 0, 2, null, 4), /changed the total within the snapshot/);
  assert.throws(() => normalizeReviewHistoryPage({ ...response, snapshot_at: "invalid" }, "approved", 0, 2), /invalid snapshot/);
  assert.throws(() => normalizeReviewHistoryPage(response, "approved", 2, 2), /inconsistent pagination/);
  assert.throws(() => normalizeReviewHistoryPage({ ...response, items: [], has_more: true, next_offset: 0 }, "approved", 0, 2), /empty non-terminal page/);
  assert.throws(() => normalizeReviewHistoryPage(response, "all", 0, 2), /approved or rejected/);
  assert.throws(() => normalizeReviewHistoryPage({
    ...response,
    items: [{ id: "RUN-1", status: "approved" }, { id: "RUN-1", status: "approved" }],
  }, "approved", 0, 2), /duplicate decision IDs/);
  assert.throws(() => normalizeReviewHistoryPage({
    ...response,
    items: [{ id: "RUN-3", status: "rejected" }],
  }, "approved", 0, 2), /outside the requested decision set/);
  const lastPage = normalizeReviewHistoryPage({
    total: 3,
    limit: 2,
    offset: 2,
    has_more: false,
    next_offset: null,
    snapshot_at: response.snapshot_at,
    items: [{ id: "RUN-3", status: "approved" }],
  }, "approved", 2, 2, response.snapshot_at);
  assert.equal(lastPage.hasMore, false);
  assert.throws(() => normalizeReviewHistoryPage({
    total: 3, limit: 2, offset: 2, has_more: false, next_offset: null,
    snapshot_at: "2026-11-23T12:00:01+00:00", items: [{ id: "RUN-3", status: "approved" }],
  }, "approved", 2, 2, response.snapshot_at), /changed the decision-history snapshot/);
});

test("review-history pages merge by run ID and sort by persisted decision time", () => {
  const first = [
    { id: "RUN-1", status: "approved", updated_at: "2026-11-20T10:00:00Z" },
    { id: "RUN-2", status: "rejected", updated_at: "2026-11-21T10:00:00Z" },
  ];
  const next = [
    { id: "RUN-1", approval_status: "approved", updated_at: "2026-11-22T10:00:00Z" },
    { id: "RUN-3", status: "approved", updated_at: "2026-11-19T10:00:00Z" },
    { id: "RUN-PENDING", status: "review" },
    null,
  ];
  const merged = mergeReviewHistoryRecords(first, next);
  assert.deepEqual(merged.map((item) => item.id), ["RUN-1", "RUN-2", "RUN-3"]);
  assert.equal(merged[0].updated_at, "2026-11-22T10:00:00Z");
  assert.deepEqual(mergeReviewHistoryRecords(null, "invalid"), []);
});

test("review-history merge never replaces a newer persisted decision with an older duplicate", () => {
  const newer = { id: "RUN-1", status: "approved", updated_at: "2026-11-23T10:00:00Z", goal: "Latest" };
  const older = { id: "RUN-1", status: "approved", updated_at: "2026-11-22T10:00:00Z", goal: "Stale" };
  assert.equal(mergeReviewHistoryRecords([newer], [older])[0].goal, "Latest");
  assert.equal(mergeReviewHistoryRecords([older], [newer])[0].goal, "Latest");
});

test("partial review refresh replaces successful decisions and preserves failed snapshots", () => {
  const existing = [
    { id: "RUN-APPROVED-OLD", status: "approved", updated_at: "2026-11-20T10:00:00Z" },
    { id: "RUN-REJECTED-OLD", status: "rejected", updated_at: "2026-11-19T10:00:00Z" },
  ];
  const refreshed = [
    { id: "RUN-APPROVED-NEW", status: "approved", updated_at: "2026-11-23T10:00:00Z" },
  ];
  const merged = mergeReviewHistoryRefresh(existing, refreshed, ["approved"]);
  assert.deepEqual(merged.map((record) => record.id), ["RUN-APPROVED-NEW", "RUN-REJECTED-OLD"]);
  assert.deepEqual(mergeReviewHistoryRefresh(existing, [], []), existing);
  assert.deepEqual(mergeReviewHistoryRefresh(existing, [], ["approved", "rejected"]), []);
});

test("review-history search requires every term and filters by decision", () => {
  const records = [
    { id: "RUN-101", status: "approved", goal: "Cafe\u0301 API reliability", updated_at: "2026-11-22T10:00:00Z" },
    { id: "RUN-102", status: "rejected", goal: "Secure payment workflow", updated_at: "2026-11-21T10:00:00Z" },
  ];
  assert.deepEqual(filterReviewHistory(records, "cafe reliability").map((item) => item.id), ["RUN-101"]);
  assert.deepEqual(filterReviewHistory(records, "secure rejected", "rejected").map((item) => item.id), ["RUN-102"]);
  assert.deepEqual(filterReviewHistory(records, "secure", "approved"), []);
  assert.deepEqual(filterReviewHistory(records, "no matching decision"), []);
  assert.deepEqual(filterReviewHistory(null), []);
});
