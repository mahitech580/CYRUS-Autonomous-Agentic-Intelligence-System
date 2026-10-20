# Task Retry and Recovery Policy

CYRUS retries are operator initiated. A retry is a **new execution record**, not a rewind or a continuation of the old worker.

## Eligibility

Only tasks in `FAILED`, `CANCELLED`, or `TIMED_OUT` can be retried. A running, queued, awaiting-approval, or completed task returns HTTP 409. Missing task IDs return HTTP 404. A retry also requires a usable stored objective and an allowed mode.

A new task records the retry budget from `CYRUS_MAX_TASK_RETRIES` (default `3`, clamped to 0–10). A value of `0` disables retries. That recorded cap is inherited by descendants, so raising the environment value later does not expand an existing lineage. The active deployment cap is also enforced as a stricter ceiling: the effective limit is the lower of the stored lineage cap and the current environment setting. Each retry increments the attempt number, and no request can create an attempt beyond that effective limit.

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
- `max_task_retries`: the configured cap recorded when that lineage was created.
- `effective_max_task_retries`: the active cap after applying any stricter deployment setting.

History keeps the recorded cap. API responses and report exports also expose the effective cap so the UI does not offer a retry that the current deployment will reject.

A successful new attempt returns HTTP 202. A recognized duplicate returns HTTP 200 with `deduplicated: true`. Invalid or conflicting idempotency keys return HTTP 400 or 409. A saturated worker pool or exhausted submission rate limit returns HTTP 429; rate-limited responses carry `Retry-After`.

Each source task can have one direct retry child. Repeating the action with a fresh key returns that child instead of creating sibling jobs. To retry again after the child fails, open that child and retry it; this creates a traceable chain and keeps the retry depth meaningful.

## Lineage endpoint

```http
GET /api/tasks/{task_id}/lineage
X-CYRUS-Access-Key: <only when API access protection is enabled>
```

The endpoint returns `current_task_id`, `root_task_id`, `attempt_count`, `truncated`, and an `attempts` array ordered from the root toward descendants. The graph walk tolerates missing legacy parents, duplicate historical branches, and cyclic or malformed parent pointers without looping forever. It caps the connected result at 50 summaries and marks `truncated: true` when more records remain.

The result deliberately uses the compact task summary schema. It does **not** include implementation drafts, raw trace payloads, artifacts, or provider credentials. The execution inspector renders this response as an attempt timeline. Selecting an attempt opens that task record; retrying still requires the selected record to have a terminal, retryable status and remaining budget.


## Data and report behavior

Retry metadata is saved with the normal execution history snapshot and appears in compact task results. The task modal shows the connected retry chain and lets operators open each attempt. JSON, Markdown, and CSV reports carry the lineage so exported records can be correlated without relying on browser state.

Artifacts, review scores, and static-analysis results from the parent are **not copied into the new attempt**. The retry starts with a clean runtime record, and its verification results are populated only by its own execution. The previous failure is preserved in the previous record, not re-labelled as the new attempt's result.

## Operational notes

- Retrying is always explicit. CYRUS does not automatically retry provider failures or replay potentially billable model calls in the background.
- The standard API access-key middleware, worker-capacity check, and per-client execution rate limiter also apply to retries.
- Use an `Idempotency-Key` when a client may repeat a POST after a timeout or lost response.
- `TIMED_OUT` is terminal for polling and can be retried when budget remains. It is not a verified test failure or a claim that generated code was executed.
- A process restart remains distinct from retry: the interrupted task is marked incomplete/failed and must be explicitly retried by an operator.
- The retry reservation and the wider live-task/idempotency maps are process-local, matching the current Render Blueprint's single Gunicorn worker. If the service is changed to multiple workers or scaled across instances, move retry claims and idempotency coordination into a shared transactional store before treating sibling prevention as a cross-process guarantee.
