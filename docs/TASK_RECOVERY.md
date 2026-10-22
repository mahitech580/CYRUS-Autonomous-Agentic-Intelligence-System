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


## Inspect retry history

```http
GET /api/tasks/{task_id}/lineage
X-CYRUS-Access-Key: <only when API access protection is enabled>
```

The lineage response contains `current_task_id`, `root_task_id`, `attempt_count`, `truncated`, and an `attempts` array ordered from the connected root toward its descendants. Each item is a compact task summary with its recorded/effective retry caps, parent task ID, retry number and safe retry reason. It does **not** return implementation drafts, artifacts or event bodies. The server guards against missing parents and cyclic metadata and caps the response at 50 connected attempts; `truncated: true` signals that the display cap was reached. Unknown task IDs return HTTP 404.

The execution inspector renders this response as an attempt timeline. Selecting an attempt opens that task record; retrying still requires the selected record to have a terminal, retryable status and remaining effective budget. When the lineage endpoint is unavailable, the inspector keeps the current execution usable and shows a retry-history warning instead of discarding the record.

## Deterministic recovery guidance

```http
GET /api/tasks/{task_id}/recovery
X-CYRUS-Access-Key: <only when API access protection is enabled>
```

This endpoint returns `task_id`, `status`, `category`, `headline`, `explanation`, a `steps` array, `retry_guidance`, retry eligibility/cap metadata, `synthetic_demo`, and the source label `deterministic_runtime_guidance`. It chooses advice from the persisted status and safe failure type, using categories for synthetic demo runs, timeouts, provider/configuration failures, network/provider failures, cancellations, generic failures, completed tasks, and active tasks.

Guidance deliberately does not return the raw failure message or infer root cause from arbitrary error text. The response includes `schema_version: 1` so clients can identify the advice contract explicitly; clients should tolerate additional fields in later compatible versions. Failure categories are selected from tokenized exception names—not broad substring matching—so names such as `GeneratedArtifactError` are not mislabeled as rate-limit failures. `RateLimitExceededError`, quota/throttle names, and HTTP 429-style names receive the dedicated `rate_limited` category with reset-window and concurrency advice. HTTP 402 is mapped to `provider_billing`; common 400/404/405/413/415/422 request rejections are mapped to `provider_request`. Unknown failure types receive generic trace-inspection steps. Recommendations are deterministic suggestions, not an automated diagnosis; retrying is still a separate explicit API action subject to terminal status, idempotency, capacity, rate limits, and the effective lineage cap.

The response also carries a stable `recommended_action` enum for clients that need to route or summarize guidance without parsing prose:

| Action code | Intended operator action |
| --- | --- |
| `review_demo_limits` | Treat a synthetic record as interface-only evidence |
| `reduce_scope_and_inspect_trace` | Narrow the objective and inspect the last completed stage |
| `correct_provider_configuration` | Fix backend provider/model configuration before another request |
| `check_provider_billing` | Resolve provider billing, available credits, or usage-plan limits |
| `review_request_contract` | Check the endpoint, model identifier, request size, and required parameters |
| `wait_for_provider_reset` | Respect the rate-limit reset window before resubmitting |
| `check_provider_connectivity` | Diagnose provider/network reachability |
| `inspect_response_format` | Verify endpoint/model compatibility and inspect sanitized response-format diagnostics |
| `review_stop_point` | Inspect why the attempt was cancelled |
| `inspect_last_successful_stage` | Start diagnosis from the last trustworthy stage |
| `verify_in_sandbox` | Verify generated output in an appropriate sandbox |
| `monitor_or_cancel` | Continue monitoring active work or cancel cooperatively |

The enum is advisory. It does not authorize automated retries, change task status, or execute any suggested action. Clients should display a generic safe fallback for an unknown future code.

The execution inspector loads guidance separately from the task detail and lineage calls. If the API version does not expose this route or a transient request fails, the task record remains usable and the modal reports that guidance is unavailable rather than blocking export, trace inspection, or retry.

## Retry analytics

The Analytics API `GET /api/analytics?days=7` returns a `retry_outcomes` object using actual task records, not seeded demo values. The workspace displays retry totals, outcomes by depth, active retry attempts, and recovery after an unsuccessful parent.

- `total_attempts` counts retry records only; the original task is not included.
- `lineages_with_retries` counts distinct connected roots represented among retry records.
- `by_depth` provides each retry number's total, completed, failed, cancelled, timed-out, active, and terminal counts.
- `completion_rate` is completed retry attempts divided by terminal retry attempts. Running or awaiting-approval attempts are not in that denominator.
- `eligible_after_failure` counts retry attempts whose recorded parent ended as `FAILED`, `CANCELLED`, or `TIMED_OUT`.
- `resolved_after_failure` counts those attempts that are terminal; `recovered_after_failure` counts the subset that completed.
- `recovery_rate` is completed retry attempts divided by resolved retry attempts after an unsuccessful parent. It is `0` if no such attempts have resolved yet.

These are execution-history metrics, not proof that generated code or proposed application tests ran. The retry ancestry walk has a 50-hop/cycle guard when counting roots; the separate lineage endpoint has its own 50-record presentation limit.

## Data and report behavior

Retry metadata is saved with the normal execution history snapshot and appears in compact task results. The task modal shows the connected retry chain and lets operators open each attempt. JSON, Markdown, and CSV reports carry the lineage so exported records can be correlated without relying on browser state.

Artifacts, review scores, and static-analysis results from the parent are **not copied into the new attempt**. The retry starts with a clean runtime record, and its verification results are populated only by its own execution. The previous failure is preserved in the previous record, not re-labelled as the new attempt's result.

## Browser-only demo behavior

When the page is opened with `?demo=1`, `demo-bridge.js` intercepts supported `/api/*` routes locally before calling `fetch`. This is intentional demo mode, not an API fallback. The page visibly labels it as synthetic and records tasks in `localStorage` for the current browser profile only.

The demo supports a deterministic failure prompt containing `simulate failure`, so operators can inspect the task modal, retry button, lineage timeline, and analytics without contacting a model provider. The initial task is marked as a synthetic failure; the explicit retry generates a separate synthetic completed attempt. Demo task results use `provider: browser-demo` and `verification_status: SYNTHETIC_DEMO_ONLY`. They must not be confused with backend task history or evidence that code was executed.

Opening the page without `?demo=1` preserves the configured backend path. If a remote API is configured but unreachable, the bridge does not disguise that failure as a successful local execution. To exercise the real runtime locally, start Flask and open the page without the demo query parameter.

## Operational notes

- Retrying is always explicit. CYRUS does not automatically retry provider failures or replay potentially billable model calls in the background.
- The standard API access-key middleware, worker-capacity check, and per-client execution rate limiter also apply to retries.
- Use an `Idempotency-Key` when a client may repeat a POST after a timeout or lost response.
- `TIMED_OUT` is terminal for polling and can be retried when budget remains. It is not a verified test failure or a claim that generated code was executed.
- A process restart remains distinct from retry: the interrupted task is marked incomplete/failed and must be explicitly retried by an operator.
- The retry reservation and the wider live-task/idempotency maps are process-local, matching the current Render Blueprint's single Gunicorn worker. If the service is changed to multiple workers or scaled across instances, move retry claims and idempotency coordination into a shared transactional store before treating sibling prevention as a cross-process guarantee.
