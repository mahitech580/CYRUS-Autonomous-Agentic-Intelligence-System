# CYRUS

CYRUS is a portfolio-grade Autonomous Agentic Intelligence System built as a visual engineering operations console. The frontend is intentionally interaction-heavy and polished, while a compact Flask REST API drives the execution state behind it.

## Stack

- React 18 via CDN
- HTML5
- CSS3
- Vanilla JavaScript and JSX
- Python 3.11+
- Flask 3.1
- REST APIs
- Persistent JSON execution memory

## Agent flow

ORCHESTRATOR → PLANNER → RESEARCHER → CODER → TESTER → REVIEWER → RELEASE

Each stage receives the objective and execution context, moves the shared runtime forward, emits structured events and contributes to the final release score.

## Run

```powershell
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
python server.py
```

Open `http://127.0.0.1:8000/`.

## REST API

- `GET /api/health`
- `GET /api/agents`
- `GET /api/tools`
- `GET /api/tasks` — compact list with optional `limit` and `status` filters
- `GET /api/tasks/{id}` — full execution record including agent state and trace
- `POST /api/tasks/{id}/cancel` — cooperative cancellation
- `POST /api/tasks/{id}/approve` — supervised release approval
- `GET /api/memory`
- `GET /api/metrics` — worker capacity, active runs and latency statistics
- `POST /api/execute` — idempotency-aware execution submission

### Execute payload

```json
{
  "prompt": "Build a production-ready REST API for task management...",
  "mode": "autonomous"
}
```

Modes: `autonomous` and `supervised`.

Use an `Idempotency-Key` header for retry-safe submissions. Supervised runs pause after REVIEWER and remain in `AWAITING_APPROVAL` until explicitly approved. Request IDs are returned as `X-Request-ID` and execution events contain stable event IDs for trace correlation.

## Demo mode

CYRUS runs a deterministic full seven-agent execution when no model API key is configured. The repository also includes a browser fallback bridge so the GitHub Pages build remains interactive even when the Flask API is unavailable. The browser demo can execute an objective, show all seven stages, render execution events, metrics and artifacts, and retain demo history for the session.

### Browser demo

**GitHub Pages:** https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/

The static demo is designed to degrade gracefully: when the backend cannot be reached, the UI automatically falls back to the deterministic demo runtime rather than displaying a broken application.

### Runtime verification

For the full backend runtime, start Flask locally with `python server.py` and open `http://127.0.0.1:8000/`. The browser bridge only activates when API requests fail, so local backend execution remains the primary runtime.

## Provider architecture

The orchestration engine talks to a small provider adapter in `providers.py`. The shipped provider is deterministic and offline-safe, which keeps the portfolio/demo runtime reproducible. A future OpenAI-compatible provider can implement the same interface without changing the seven-agent execution graph.

## Runtime controls

The server is production-safe by default: development debug mode is disabled unless `CYRUS_DEBUG=1`. Optional controls include `CYRUS_HOST`, `CYRUS_PORT`, `CYRUS_MAX_CONCURRENT_TASKS`, `CYRUS_MAX_REQUEST_BYTES`, and `CYRUS_MAX_PROMPT_CHARS`.

## UI

The Command surface contains the objective editor, execution mode switch, live seven-agent graph, metrics, terminal-style trace and artifact explorer. Agents, Memory, Tools and History each have dedicated interactive views.

## Future improvements

- Provider adapters for multiple LLM vendors
- Real repository workspace execution
- Docker-backed isolated tool runtime
- Approval workflow persistence
- Postgres event store
- Authentication and multi-user workspaces
