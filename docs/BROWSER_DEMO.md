# Browser Demo Guide

The browser demo is a deterministic UI simulator for people who want to explore CYRUS without a live backend. It is not a substitute for a real provider-backed execution.

## Start the demo

Open the GitHub Pages site with the exact query parameter `?demo=1`:

```text
https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/?demo=1
```

Only the explicit `demo=1` value selects the local simulator. The regular site connects to the configured Flask API. If the real API is unavailable, the browser does not quietly convert the failure into a synthetic success.

## Try the recovery flow

On the Command page, submit an objective containing one of these exact phrases:

- `simulate failure` — creates a terminal `FAILED` demo record with a synthetic `DemoFailure` reason.
- `simulate timeout` — creates a terminal `TIMED_OUT` record with a synthetic `TaskTimedOut` reason.

Open the record and use **RETRY EXECUTION**. A retry uses a new task ID and trace, points to its source with `parent_task_id`, and increments `retry_number`. The parent artifact list is not copied into the child. Use the lineage panel to browse the attempt chain and the Analytics page to view retry outcomes by depth.

These triggers create fixtures immediately; they do **not** wait for a real task timeout, call an LLM, run user code, or verify an application. The UI marks records with `provider: browser-demo` and `verification_status: SYNTHETIC_DEMO_ONLY`.

## Recovery categories in the demo

The simulator mirrors the recovery-response contract for common provider failure types so the UI can be exercised without network calls:

| Synthetic failure type | Guidance category | Recommended action |
| --- | --- | --- |
| `ProviderBillingError` | `provider_billing` | `check_provider_billing` |
| `ProviderRequestError` | `provider_request` | `review_request_contract` |
| `ProviderRateLimitError` | `rate_limited` | `wait_for_provider_reset` |
| `ProviderResponseError` | `provider_response` | `inspect_response_format` |
| `ProviderConnectionError` | `provider_or_network` | `check_provider_connectivity` |

These are UI fixtures only. Even when a synthetic record includes a `retry_after_seconds` field, the demo does not contact a provider, sleep, or schedule another request. The recovery panel only displays a bounded wait hint for `rate_limited` records. Billing or connection failures cannot acquire a rate-limit delay merely because malformed legacy data contains that field.

## Export a local session

Choose **EXPORT LOCAL HISTORY** in the demo banner. The simulator returns a versioned `CYRUS_BROWSER_DEMO_ARCHIVE` JSON document containing the records retained by the current browser profile. The machine-readable contract is published at [`schemas/browser-demo-archive-v1.schema.json`](../schemas/browser-demo-archive-v1.schema.json). Each task passes through the existing task-report allowlist and redaction logic; provider credentials and idempotency keys are not included as task fields.

The archive includes an export timestamp, schema version, count, sanitized per-task reports, and a warning that secret-like free text is detected heuristically. That warning is important: no regular-expression sanitizer can guarantee discovery of every credential embedded in arbitrary prose. Inspect the file before sharing it. To restore an archive, choose **IMPORT ARCHIVE** in the demo banner and select the JSON file. The confirmation preview shows the source filename, completed/failed/timed-out/cancelled counts, retry count, and maximum retry depth before writing anything. Import accepts schema version 1 only (including JSON files with a UTF-8 BOM), caps the file at 1 MiB and 25 task records, limits each objective to 4,000 characters, re-applies the report allowlist, rejects malformed IDs/states and duplicate task IDs, and refuses imports that would exceed the 25-record local retention limit. Import is atomic: an invalid entry rejects the whole archive without partially changing history, and a blocked or full local-storage write returns an error without modifying the in-memory task list. Imported tasks are historical reports, not resumable executions; no code runs and no backend is modified.

## Retention and local reset

- The simulator retains at most 25 task records in the current browser's local storage. On startup it discards malformed task IDs, unsupported states, and duplicate task IDs rather than rendering ambiguous records.
- Other open tabs on the same origin refresh their in-memory history when browser storage changes, including external reset/import operations. The tab that performed a change updates itself directly; the browser `storage` event is used only for the other tabs.
- The in-memory idempotency cache is bounded to 256 keys. A key that still points to an evicted record returns HTTP 410 rather than silently creating a duplicate.
- The lineage view returns at most 50 connected attempt summaries.
- **CLEAR LOCAL HISTORY** asks for confirmation, persists an empty local history before clearing in-memory records and the simulator's idempotency map, and reports a storage error without deleting in-memory data if that write fails. It does not send a delete request to Flask and cannot remove backend history.

If browser storage is blocked, the demo can still operate in the current page session, but local persistence may not be available. The demo health response exposes `storage_available` and `storage_warning`, and the live metrics response also exposes `storage_available`; the banner refreshes its visible warning from live metrics when persistence is unavailable. Archive restore fails atomically if the storage write is blocked or over quota. Private-browsing and browser cleanup rules also affect how long records survive.

## Demo API surface

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Reports local-demo mode and browser-only persistence |
| `GET /api/tasks` | Lists, searches, and filters retained synthetic runs |
| `GET /api/tasks/{id}` | Reads one local demo record |
| `GET /api/tasks/{id}/lineage` | Returns the bounded original-to-retry attempt chain |
| `GET /api/tasks/{id}/stream` | Emits a synthetic SSE snapshot and trace, including task-scoped cursor resume |
| `POST /api/tasks/{id}/retry` | Creates a new synthetic retry for a failed, cancelled, or timed-out record |
| `GET /api/analytics` | Computes synthetic activity and recovery metrics from local records |
| `GET /api/demo/export` | Returns a sanitized, versioned session archive |
| `POST /api/demo/import` | Validates, re-sanitizes, and restores archive task reports locally |
| `POST /api/demo/reset` | Clears local records and idempotency entries |

The simulator applies input validation and uses the same report allowlist to help make local testing predictable, but it does not provide API authentication or production persistence. It is intended for one browser profile and should not be treated as a shared multi-user service.
