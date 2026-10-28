# CYRUS — Autonomous Agentic Intelligence System

CYRUS is a model-backed engineering workspace coordinating seven specialist agents through a review-first workflow: planning, research, architecture, coding, testing, review, and release preparation.

## Current implementation

## Interface and operational truthfulness

The workspace uses runtime-reported readiness instead of synthetic deployment events or example diffs presented as live data. The review view lists saved runs and opens persisted agent artifacts; deployment links point to the actual workspace, API docs, source and CI results. The dashboard's completed-workflow count includes runs that have finished all seven stages and reached review or approval. The UI does not indicate an integration is connected merely because an adapter is supported.


- React + Vite frontend with a responsive operations console, run history, persisted workflow metrics, live run polling, generated stage artifacts, Markdown report export, filtered CSV run-history export, manual refresh, cancellation, review decisions, and setup diagnostics.
- Python/FastAPI REST API using the OpenAI Responses API (or a compatible Responses endpoint) for real model output.
- Seven model-backed stages with saved outputs, token usage where returned, stage events, run statuses, and provider failure handling.
- SQLAlchemy persistence. SQLite is intended for local development; production runs require managed PostgreSQL or MySQL.
- Optional web research for Scout through the Responses API web_search tool, opt-in with CYRUS_ENABLE_WEB_SEARCH=true.
- Workspace access-key protection for production API operations; the access key is stored in browser session storage only.
- Human review gate and report export. Generated code is not automatically executed, pushed to GitHub, or deployed.
- GitHub Actions frontend build and backend API tests.

## Quick start

### Frontend

From the repository root:

    npm install
    npm run dev

Open http://localhost:5173.

### Backend

From a second terminal at the repository root:

    python -m venv .venv
    # Windows PowerShell: .venv\Scripts\Activate.ps1
    # macOS/Linux: source .venv/bin/activate
    pip install -r backend/requirements.txt
    uvicorn backend.main:app --reload --port 8000

Open http://localhost:8000/docs for the interactive API reference.

### Configure a real model

Set OPENAI_API_KEY in the backend server environment. Do not put this secret in a VITE_* variable or in frontend code. The default model is gpt-6-luna; override it with CYRUS_MODEL if your API account uses a different model. OPENAI_BASE_URL defaults to https://api.openai.com/v1.

A full workflow calls the model once for each of the seven stages. Usage and cost depend on the chosen model, output size, retries, and provider pricing. Start with short goals and a conservative CYRUS_MAX_OUTPUT_TOKENS limit. CYRUS_LLM_TIMEOUT_SECONDS bounds each provider request.

Set CYRUS_ENABLE_WEB_SEARCH=true to allow the Scout stage to use the Responses API web-search tool. This can incur additional provider/tool charges. It is disabled by default.

### Configure persistent data

For local development, the default SQLite file cyrus.db is adequate.

For a deployed serverless application, set DATABASE_URL to a managed PostgreSQL or MySQL database. Example URLs:

    postgresql+psycopg://user:password@host:5432/cyrus
    mysql+pymysql://user:password@host:3306/cyrus

Provision the database in your own account, enable TLS as recommended by the provider, and use a least-privilege database user. The service refuses to start production workflow runs when storage is only ephemeral SQLite. Back up the data and use formal migrations for production schema changes.

### Protect public deployments

Set a long random CYRUS_ACCESS_KEY in the backend host's environment variables. Then enter the same value in CYRUS Settings. Protected routes require an Authorization Bearer token; the browser keeps the key in session storage only. Do not reuse a provider key as the workspace access key.

For Vercel, configure server-only variables in the cyrus-api project's Environment Variables settings. The frontend project only needs VITE_API_BASE_URL=https://cyrus-api-mahendra8.vercel.app. Never copy OPENAI_API_KEY, DATABASE_URL, or CYRUS_ACCESS_KEY into frontend environment variables. Configure CORS_ORIGINS with the exact trusted frontend origin(s).

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| OPENAI_API_KEY | Yes for AI workflows | Server-side model credential |
| OPENAI_BASE_URL | No | Responses API base URL |
| CYRUS_MODEL | No | Model name; defaults to gpt-6-luna |
| CYRUS_MAX_OUTPUT_TOKENS | No | Per-agent response token ceiling, default 1200 |
| CYRUS_LLM_TIMEOUT_SECONDS | No | Timeout per provider call, default 35 |
| CYRUS_ENABLE_WEB_SEARCH | No | Enables web search for Scout only; default false |
| DATABASE_URL | Production required | Managed durable PostgreSQL/MySQL URL |
| CYRUS_ACCESS_KEY | Production required | Shared workspace access key |
| CORS_ORIGINS | Yes for browser deployment | Comma-separated trusted frontend origins |
| VITE_API_BASE_URL | Frontend | Public URL for CYRUS REST API |

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Health and provider/storage status |
| GET | /api/config | Setup readiness without secrets |
| GET | /api/agents | Seven agent contracts |
| GET | /api/runs | List saved runs (access controlled in production) |
| POST | /api/runs | Start a real model-backed workflow |
| GET | /api/runs/{run_id} | Fetch saved output, events and status |
| GET | /api/runs/{run_id}/events?after=... | Fetch newer events |
| POST | /api/runs/{run_id}/approval | Record approve/reject decision; does not deploy |
| POST | /api/runs/{run_id}/cancel | Request cancellation of queued/running work |

Example request:

    curl -X POST http://localhost:8000/api/runs -H "Content-Type: application/json" -d '{"goal":"Design a secure profile API with validation and tests"}'

## Test and build

    npm install
    npm test
    npm run build
    cd backend
    pytest -q

CI runs the frontend production build and backend API tests on pushes and pull requests to main.

## Safety boundaries

CYRUS generates real model-backed plans, architecture proposals, code artifacts, tests, review findings and release checklists. It does not run AI-generated code, install generated packages, write to arbitrary repositories, or deploy to production. Generated content is untrusted until reviewed. Safe execution requires a disposable isolated runner, resource/time limits, restricted network and filesystem access, audit logs, explicit permissions, and human approval for repository or deployment writes.

Production readiness also requires a managed database, configured provider credential, access key, backup and retention policies, and rate/cost controls. The app exposes setup status rather than pretending missing services are ready.

## Technical references

- React: https://react.dev/learn
- Vite: https://vite.dev/guide/
- FastAPI: https://fastapi.tiangolo.com/tutorial/
- SQLAlchemy: https://docs.sqlalchemy.org/en/20/orm/
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI production best practices: https://platform.openai.com/docs/guides/production-best-practices
- Vercel Python runtime: https://vercel.com/changelog/python-on-vercel-is-now-generally-available
- Vercel interface guidelines: https://vercel.com/design/guidelines

These references guide integration and interface conventions; this repository's application code is authored for CYRUS.

## License

No license has been selected yet. Add a license file before external redistribution.
