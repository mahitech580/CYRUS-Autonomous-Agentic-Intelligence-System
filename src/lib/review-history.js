const DECISION_STATES = new Set(["approved", "rejected"]);

function normalizeReviewSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/([A-Za-z])\p{M}+/gu, "$1")
    .toLowerCase();
}

export function getReviewDecision(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const approval = String(record.approval_status ?? "").trim().toLowerCase();
  if (DECISION_STATES.has(approval)) return approval;
  const status = String(record.status ?? "").trim().toLowerCase();
  return DECISION_STATES.has(status) ? status : null;
}

/** Validate the complete API envelope before a decision-history page advances its cursor. */
export function normalizeReviewHistoryPage(
  response,
  expectedDecision,
  expectedOffset,
  expectedLimit,
  expectedSnapshotAt = null,
) {
  if (!DECISION_STATES.has(expectedDecision)) {
    throw new TypeError("A review-history page requires an approved or rejected decision filter.");
  }
  if (!Number.isSafeInteger(expectedOffset) || expectedOffset < 0
    || !Number.isSafeInteger(expectedLimit) || expectedLimit < 1 || expectedLimit > 100) {
    throw new TypeError("The review-history request has invalid pagination parameters.");
  }
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.items)) {
    throw new TypeError("The review-history endpoint returned an invalid page.");
  }
  if (!Number.isSafeInteger(response.total) || response.total < 0
    || !Number.isSafeInteger(response.offset) || response.offset !== expectedOffset
    || !Number.isSafeInteger(response.limit) || response.limit !== expectedLimit
    || response.offset > response.total
    || response.items.length > expectedLimit) {
    throw new TypeError("The review-history endpoint returned inconsistent pagination metadata.");
  }
  if (response.items.some((record) => (
    !record || typeof record !== "object" || Array.isArray(record)
    || typeof record.id !== "string" || !record.id.trim()
    || getReviewDecision(record) !== expectedDecision
  ))) {
    throw new TypeError("The review-history endpoint returned a record outside the requested decision set.");
  }
  if (typeof response.has_more !== "boolean") {
    throw new TypeError("The review-history endpoint returned an invalid continuation flag.");
  }
  const expectedNextOffset = expectedOffset + response.items.length;
  const expectedHasMore = expectedNextOffset < response.total;
  if (response.has_more !== expectedHasMore
    || response.next_offset !== (expectedHasMore ? expectedNextOffset : null)) {
    throw new TypeError("The review-history endpoint returned an inconsistent next-page cursor.");
  }
  const snapshotAt = response.snapshot_at;
  if (typeof snapshotAt !== "string" || !snapshotAt.trim() || !Number.isFinite(Date.parse(snapshotAt))) {
    throw new TypeError("The review-history endpoint returned an invalid snapshot timestamp.");
  }
  if (expectedSnapshotAt != null && snapshotAt !== expectedSnapshotAt) {
    throw new TypeError("The review-history endpoint changed the decision-history snapshot between pages.");
  }
  return {
    items: response.items,
    total: response.total,
    pageLength: response.items.length,
    snapshotAt,
    hasMore: response.has_more,
    nextOffset: response.next_offset,
  };
}

function reviewRecordTime(record) {
  const timestamp = Date.parse(record?.updated_at || record?.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/** Merge server pages by stable run ID, preferring the newest persisted version. */
export function mergeReviewHistoryRecords(existing, incoming) {
  const records = new Map();
  const previous = Array.isArray(existing) ? existing : [];
  const additions = Array.isArray(incoming) ? incoming : [];
  for (const record of [...previous, ...additions]) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || !getReviewDecision(record)) continue;
    const current = records.get(id);
    if (!current || reviewRecordTime(record) >= reviewRecordTime(current)) records.set(id, record);
  }
  return [...records.values()].sort((left, right) => (
    reviewRecordTime(right) - reviewRecordTime(left)
    || String(left.id).localeCompare(String(right.id))
  ));
}

/** Replace only decision sets that refreshed successfully; retain last-known-good failed sets. */
export function mergeReviewHistoryRefresh(existing, incoming, successfulDecisions) {
  const replaced = new Set((Array.isArray(successfulDecisions) ? successfulDecisions : [])
    .filter((decision) => DECISION_STATES.has(decision)));
  const preserved = (Array.isArray(existing) ? existing : [])
    .filter((record) => !replaced.has(getReviewDecision(record)));
  return mergeReviewHistoryRecords(preserved, incoming);
}

/** Search only persisted decision metadata; reviewer notes remain in the run detail event history. */
export function filterReviewHistory(records, query = "", decisionFilter = "all") {
  const items = Array.isArray(records) ? records : [];
  const terms = normalizeReviewSearchValue(query).match(/[\p{L}\p{N}\p{M}]+/gu) || [];
  return items.filter((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    const decision = getReviewDecision(record);
    if (!decision || (decisionFilter !== "all" && decision !== decisionFilter)) return false;
    const searchable = normalizeReviewSearchValue([
      record.id,
      record.goal,
      record.status,
      record.approval_status,
      record.current_stage,
      record.execution_mode,
      record.created_at,
      record.updated_at,
    ].map((value) => String(value ?? "")).join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
