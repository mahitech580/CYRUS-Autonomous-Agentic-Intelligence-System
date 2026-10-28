# CYRUS — Autonomous Agentic Intelligence System

CYRUS is a futuristic AI engineering workspace for coordinating a review-first software delivery workflow. It turns an engineering goal into explicit stages for planning, research, architecture, coding hand-off, testing, review, and release preparation.

This repository is a fresh implementation on the main branch. It is not a restored copy of earlier project files.

## Product direction

- One operations console for workflow runs, specialist agents, progress, telemetry, review gates, environments, and integration status.
- Seven role contracts: Atlas (planning), Scout (research), Forma (architecture), Forge (coding), Sentinel (QA), Lens (review), and Orbit (release).
- A React + Vite frontend with responsive layouts, accessible focus states, working navigation, run creation, search/filter, a review checklist, and run-detail drawer.
- A FastAPI REST API with durable workflow records through SQLAlchemy; SQLite works locally, and PostgreSQL/MySQL connection URLs are supported.
- Optional Flask and Django view adapters for projects that already use those frameworks.
- A deterministic preview runner that demonstrates stage hand-offs without pretending to call a real model, change code, run untrusted code, or deploy to production.

## Current maturity

The console and API contracts are an executable starter system, not a fully autonomous production agent. The default orchestrator emits deterministic stage summaries. To produce real AI artifacts, implement and configure a provider adapter with scoped credentials, tool permissions, budget limits, structured outputs, retries, observability, and human approval for consequential actions. The release stage deliberately stops at an approval gate.

## Stack

Frontend: React, HTML, CSS, JavaScript, Vite, Lucide icons.

Canonical API: Python, FastAPI, Pydantic, SQLAlchemy, REST/JSON.

Database options: SQLite (default), PostgreSQL via psycopg, MySQL via PyMySQL.

Extension points: model/AI-ML providers, Flask status adapter, Django health view, background job queue, server-sent events, GitHub and CI integrations.

## Quick start

### 1. Frontend

Install Node.js compatible with the current Vite release, then run from the repository root:

    npm install
    npm run dev

Open http://localhost:5173.

### 2. API

Use a second terminal from the repository root:

    python -m venv .venv
    # Windows PowerShell: .venv\Scripts\Activate.ps1
    # macOS/Linux: source .venv/bin/activate
    pip install -r backend/requirements.txt
    uvicorn backend.main:app --reload --port 8000

The API reference is available at http://localhost:8000/docs. The frontend attempts the API automatically. If it cannot reach the API, the console switches to interactive in-browser demo mode.

### 3. Tests and production build

    cd backend
    pytest -q
    cd ..
    npm run build

### 4. Database selection

SQLite requires no server and is the default. To use PostgreSQL, set DATABASE_URL to a SQLAlchemy URL such as postgresql+psycopg://user:password@host:5432/cyrus. For MySQL, use mysql+pymysql://user:password@host:3306/cyrus. Configure CORS_ORIGINS for the trusted frontend origin. Never commit production connection strings or model-provider secrets.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Service and database health |
| GET | /api/ready | Readiness probe |
| GET | /api/agents | Seven agent contracts |
| GET | /api/runs | List persisted runs |
| POST | /api/runs | Queue a new workflow |
| GET | /api/runs/{run_id} | Inspect stages and event history |

Example request body for POST /api/runs:

    {"goal":"Build a resilient profile API with validation and tests"}

## Recommended next engineering milestones

1. Add provider interfaces with one real model adapter, typed tool schemas, token/cost budgets, and deterministic evaluation fixtures.
2. Move background stages to a durable queue and publish progress through SSE or WebSockets.
3. Add authentication, workspace isolation, role-based permissions, audit events, secret storage, and rate limiting.
4. Implement SQLAlchemy migrations and integration tests against PostgreSQL and MySQL in CI.
5. Add a Git workspace sandbox, diff-based patch application, isolated test execution, dependency scanning, and explicit user-approved Git operations.
6. Connect deployment providers only after review, signing, environment checks, and rollback preparation.

## Design references

The UI follows common dark developer-tool conventions, restrained accent usage, compact status surfaces, keyboard focus visibility, and explicit empty/error/prototype states.

- React documentation: https://react.dev/learn
- Vite guide: https://vite.dev/guide/
- FastAPI tutorial: https://fastapi.tiangolo.com/tutorial/
- FastAPI SQL databases: https://fastapi.tiangolo.com/tutorial/sql-databases/
- Flask quickstart: https://flask.palletsprojects.com/en/stable/quickstart/
- Django documentation: https://docs.djangoproject.com/en/stable/
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- Supabase UI patterns: https://supabase.com/design-system/docs/ui-patterns/introduction
- AI-native developer patterns: https://a16z.com/nine-emerging-developer-patterns-for-the-ai-era/

These references guide framework usage and interface decisions; CYRUS's implementation is original and does not copy code from those sites.

## Security and responsible execution

- Do not put database credentials, provider API keys, or access tokens in frontend code.
- Treat researched content, repository files, and agent-produced code as untrusted input.
- Never run generated code on the API process itself; use a disposable, isolated runner with resource limits.
- Require human approval for writes, network access, secrets, deployments, and destructive actions.
- Add authentication, rate limits, audit retention, backup/restore procedures, and migrations before internet-facing deployment.

## License

No license has been selected yet. Add a license file before inviting external contributors or redistributing the project.
