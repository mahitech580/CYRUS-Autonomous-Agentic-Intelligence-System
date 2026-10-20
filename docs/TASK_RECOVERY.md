# Task Retry and Recovery Policy

CYRUS retries are operator initiated. A retry is a **new execution record**, not a rewind or a continuation of the old worker.

## Eligibility

Only tasks in `FAILED`, `CANCELLED`, or `TIMED_OUT` can be retried. A running, queued, awaiting-approval, or completed task returns HTTP 409. Missing task IDs return HTTP 404. A retry also requires a usable stored objective and an allowed mode.

The server reads the current retry budget from `CYRUS_MAX_TASK_RETRIES` (default `3`, clamped to 0–10). A value of `0` disables retry requests. The number is the maximum retry depth after the original attempt: attempt 1 may produce retry 1, retry 1 may produce retry 2, and so on until the configured cap.

## Retry endpoint

```http
POST /api/tasks/{task_id}/retry
Idempotency-Key: cyrus-retry-{task_id}-{next_attempt}
X-CYRUS-Access-Key: <only when API access protection is enabled>
```

No request body is needed. The server reuses only the source objective and execution mode. It assigns a fresh task ID, creates a new event sequence, and records:

- `parent_task_id`: the immediate source attempt.
- `retry_number`: the attempt number in the lineage.
- `retry_reason`: terminal status and, when available, the exception type—not the raw failure message.

A successful new attempt returns HTTP 202. A recognized duplicate returns HTTP 200 with `deduplicated: true`. Invalid or conflicting idempotency keys return HTTP 400 or 409. A saturated worker pool or exhausted submission rate limit returns HTTP 429; rate-limited responses carry `Retry-After`.

Each source task can have one direct retry child. Repeating the action with a fresh key returns that child instead of creating sibling jobs. To retry again after the child fails, open that child and retry it; this creates a traceable chain and keeps the retry depth meaningful.

## Data and report behavior

Retry metadata is saved with the normal execution history snapshot and appears in compact task results. The task modal shows the source attempt and offers a link back to it. JSON, Markdown, and CSV reports carry the lineage so exported records can be correlated without relying on browser state.

Artifacts, review scores, and static-analysis results from the parent are **not copied into the new attempt**. The retry starts with a clean runtime record, and its verification results are populated only by its own execution. The previous failure is preserved in the previous record, not re-labelled as the new attempt's result.

## Operational notes

- Retrying is always explicit. CYRUS does not automatically retry provider failures or replay potentially billable model calls in the background.
- The standard API access-key middleware, worker-capacity check, and per-client execution rate limiter also apply to retries.
- Use an `Idempotency-Key` when a client may repeat a POST after a timeout or lost response.
- `TIMED_OUT` is terminal for polling and can be retried when budget remains. It is not a verified test failure or a claim that generated code was executed.
- A process restart remains distinct from retry: the interrupted task is marked incomplete/failed and must be explicitly retried by an operator.
