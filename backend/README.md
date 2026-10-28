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

SQLite is for local development only. Production runs are refused unless DATABASE_URL uses managed PostgreSQL/MySQL. Set CYRUS_ACCESS_KEY to a long random secret in the backend environment; protected endpoints require a Bearer token. Production runs are also refused if access control is not configured.

## Runtime safety

Provider outputs are saved as artifacts, not executed on the API host. The approval route records a human decision but does not deploy. Do not expose this service publicly until provider key, persistent database, workspace key, CORS origins, backups, and cost/rate controls are configured.
