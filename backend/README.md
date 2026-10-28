# CYRUS API

FastAPI is the canonical REST service. Workflow records persist through SQLAlchemy. SQLite is the zero-configuration default; PostgreSQL and MySQL are supported through connection URLs and their drivers.

## Run locally

From the repository root:

1. Create and activate a Python virtual environment.
2. Install dependencies: pip install -r backend/requirements.txt
3. Start the API: uvicorn backend.main:app --reload --port 8000
4. Open the interactive API reference at http://localhost:8000/docs.

The frontend defaults to http://localhost:8000. Set VITE_API_BASE_URL in a local .env file to override it.

## API contract

- GET /api/health — service, database, mode, and timestamp.
- GET /api/ready — readiness check, returns 503 if the database cannot be reached.
- GET /api/agents — the seven built-in role contracts.
- GET /api/runs?limit=30 — latest workflow runs.
- POST /api/runs — create a workflow. JSON body: {"goal":"Build a resilient profile API"}.
- GET /api/runs/{run_id} — inspect one run with stages and event history.

Run creation returns HTTP 202, persists the request, then schedules a background preview. The current stage executor is deterministic and does not call an LLM, edit a Git repository, run arbitrary code, or deploy services. It prepares stage summaries and leaves the run at review with release approval required.

## Database URLs

SQLite default: sqlite:///./cyrus.db

PostgreSQL example: postgresql+psycopg://cyrus:change-me@localhost:5432/cyrus

MySQL example: mysql+pymysql://cyrus:change-me@localhost:3306/cyrus

Use secrets from the environment, never a committed file. For production, provision migrations, connection pooling, durable job workers, authentication/authorization, rate limits, and audit logging before exposing the service publicly.

## Framework integrations

flask_adapter.py and django_adapter.py are optional examples for integrating status endpoints into existing Flask or Django applications. They do not duplicate the canonical orchestration state. Install Flask or Django separately if you need those adapters.
