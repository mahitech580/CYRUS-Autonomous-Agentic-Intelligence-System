# CYRUS API and agent runtime

FastAPI is the canonical REST service. It coordinates seven sequential model stages via the OpenAI Responses API. A run persists per-stage outputs and token usage and ends in review, requiring an explicit human decision.

## Local setup

From the repository root:

    pip install -r backend/requirements.txt
    # Set OPENAI_API_KEY in the process environment for actual model calls.
    uvicorn backend.main:app --reload --port 8000

The GET /api/config endpoint reports whether the model provider and durable database are configured without exposing secret values.

## Model setup

- OPENAI_API_KEY: required on the backend only.
- OPENAI_BASE_URL: defaults to https://api.openai.com/v1.
- CYRUS_MODEL: default gpt-6-luna.
- CYRUS_MAX_OUTPUT_TOKENS: max tokens per agent response (default 1200).
- CYRUS_LLM_TIMEOUT_SECONDS: per-request timeout (default 35).
- CYRUS_ENABLE_WEB_SEARCH: if true, Scout may use the Responses API web search. This may incur extra charges.

Every workflow generates seven model responses. Model usage is billed by the provider, and actual cost depends on model and output sizes.

## Persistence and access

SQLite is for local development only. Set CYRUS_ENVIRONMENT=production on non-Vercel production/staging hosts; production SQLite is rejected. Managed PostgreSQL/MySQL is treated as a production signal when no environment label is supplied. Production and staging require CYRUS_ACCESS_KEY, and CYRUS_REQUIRE_ACCESS_KEY=true can force the gate in development. Set the key to a long random secret in the backend environment; protected endpoints require a Bearer token. Production runs are refused if access control is not configured.
When durable external-worker mode is enabled, both new-run and retry requests must include an 8–128 character `Idempotency-Key`. The frontend generates stable request keys so network retries cannot create duplicate billable attempts.

## Worker lease timing

- CYRUS_WORKER_HEARTBEAT_TTL_SECONDS defines how long a worker lease remains fresh (30–300 seconds).
- CYRUS_WORKER_HEARTBEAT_SECONDS is an upper bound; the worker automatically caps renewals at one third of the lease TTL so a valid worker cannot age out between heartbeats.
- CYRUS_WORKER_RECOVERY_SECONDS is also an upper bound; stale-run reconciliation is capped at half the lease TTL so expired work is noticed promptly.
- The default 90-second TTL keeps the documented 15-second heartbeat and 30-second recovery cadence unchanged.
- If a deployment needs slower heartbeat writes, increase the TTL rather than setting the heartbeat interval beyond the lease window.

## Run launch protection

The API enforces database-backed workspace-wide limits on new billable workflow attempts: **5 launches per minute** and **30 per hour** by default. Configure `CYRUS_RUNS_PER_MINUTE` (1–60) and `CYRUS_RUNS_PER_HOUR` (1–500) on the API service to adjust them. New runs and retries share the same quota; a replay with the same accepted idempotency key does not consume another slot. Bucket identifiers use a SHA-256 hash of the shared workspace access key, never the key itself. Because this version uses one shared workspace credential rather than per-user accounts, the limits are workspace-wide, not per operator. Keep provider-side spend alerts and billing budgets enabled as an additional control.

## Runtime safety

Provider outputs are saved as artifacts, not executed on the API host. The approval route records a human decision but does not deploy. Do not expose this service publicly until provider key, persistent database, workspace key, CORS origins, backups, and cost/rate controls are configured.
