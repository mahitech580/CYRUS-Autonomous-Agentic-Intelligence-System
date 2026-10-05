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
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `GET /api/memory`
- `POST /api/execute`

### Execute payload

```json
{
  "prompt": "Build a production-ready REST API for task management...",
  "mode": "autonomous"
}
```

Modes: `autonomous` and `supervised`.

## Demo mode

CYRUS runs a deterministic full seven-agent execution when no model API key is configured. The repository also includes a browser fallback bridge so the GitHub Pages build remains interactive even when the Flask API is unavailable. The browser demo can execute an objective, show all seven stages, render execution events, metrics and artifacts, and retain demo history for the session.

### Browser demo

**GitHub Pages:** https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/

The static demo is designed to degrade gracefully: when the backend cannot be reached, the UI automatically falls back to the deterministic demo runtime rather than displaying a broken application.

### Runtime verification

For the full backend runtime, start Flask locally with `python server.py` and open `http://127.0.0.1:8000/`. The browser bridge only activates when API requests fail, so local backend execution remains the primary runtime.

## Optional provider variables

`OPENAI_API_KEY` can be added to the environment for connecting a future OpenAI-compatible provider layer. The current portfolio build keeps the execution graph provider-independent and deterministic.

## UI

The Command surface contains the objective editor, execution mode switch, live seven-agent graph, metrics, terminal-style trace and artifact explorer. Agents, Memory, Tools and History each have dedicated interactive views.

## Future improvements

- Provider adapters for multiple LLM vendors
- Real repository workspace execution
- Docker-backed isolated tool runtime
- Approval workflow persistence
- Postgres event store
- Authentication and multi-user workspaces
