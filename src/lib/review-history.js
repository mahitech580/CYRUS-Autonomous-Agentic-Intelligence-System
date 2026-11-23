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

/** Validate a status-filtered API page without treating malformed responses as empty history. */
export function normalizeReviewHistoryPage(response, expectedDecision) {
  if (!DECISION_STATES.has(expectedDecision)) {
    throw new TypeError("A review-history page requires an approved or rejected decision filter.");
  }
  if (!response || typeof response !== "object" || Array.isArray(response) || !Array.isArray(response.items)) {
    throw new TypeError("The review-history endpoint returned an invalid page.");
  }
  const total = Number(response.total);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError("The review-history endpoint returned an invalid total.");
  }
  return {
    items: response.items.filter((record) => getReviewDecision(record) === expectedDecision),
    total,
    pageLength: response.items.length,
  };
}

/** Merge server pages by stable run ID and order decisions by their persisted update time. */
export function mergeReviewHistoryRecords(existing, incoming) {
  const records = new Map();
  const previous = Array.isArray(existing) ? existing : [];
  const additions = Array.isArray(incoming) ? incoming : [];
  for (const record of [...previous, ...additions]) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || !getReviewDecision(record)) continue;
    records.set(id, record);
  }
  return [...records.values()].sort((left, right) => {
    const leftTime = Date.parse(left.updated_at || left.created_at || "");
    const rightTime = Date.parse(right.updated_at || right.created_at || "");
    const leftValue = Number.isFinite(leftTime) ? leftTime : 0;
    const rightValue = Number.isFinite(rightTime) ? rightTime : 0;
    return rightValue - leftValue || String(left.id).localeCompare(String(right.id));
  });
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
