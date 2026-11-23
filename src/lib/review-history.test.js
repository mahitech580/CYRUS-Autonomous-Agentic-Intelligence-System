import assert from "node:assert/strict";
import test from "node:test";
import {
  filterReviewHistory,
  getReviewDecision,
  mergeReviewHistoryRecords,
  normalizeReviewHistoryPage,
} from "./review-history.js";

test("review decisions accept only persisted approved and rejected states", () => {
  assert.equal(getReviewDecision({ status: "approved" }), "approved");
  assert.equal(getReviewDecision({ approval_status: "rejected" }), "rejected");
  assert.equal(getReviewDecision({ status: "completed", approval_status: "pending" }), null);
  assert.equal(getReviewDecision(null), null);
  assert.equal(getReviewDecision([]), null);
});

test("review-history pages validate totals and retain the raw page length for pagination", () => {
  const page = normalizeReviewHistoryPage({
    total: 3,
    items: [
      { id: "RUN-1", status: "approved" },
      { id: "RUN-2", status: "rejected" },
      { id: "RUN-3", status: "approved" },
    ],
  }, "approved");
  assert.equal(page.total, 3);
  assert.equal(page.pageLength, 3);
  assert.deepEqual(page.items.map((item) => item.id), ["RUN-1", "RUN-3"]);
  assert.throws(() => normalizeReviewHistoryPage({ items: [] }, "approved"), /invalid total/);
  assert.throws(() => normalizeReviewHistoryPage({ total: 0, items: {} }, "approved"), /invalid page/);
  assert.throws(() => normalizeReviewHistoryPage({ total: 0, items: [] }, "all"), /approved or rejected/);
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
