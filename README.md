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

- `GET /api/health` — liveness, provider and capacity telemetry
- `GET /api/provider` — active provider capabilities, without exposing credentials
- `GET /api/ready` — deployment readiness probe (returns 503 when workers are saturated)
- `GET /api/agents`
- `GET /api/tools`
- `GET /api/tasks` — compact list with optional `limit` and `status` filters
- `GET /api/tasks/{id}` — full execution record including agent state and trace
- `GET /api/tasks/{id}/stream` — resumable Server-Sent Events stream for live state and trace updates
- `POST /api/tasks/{id}/cancel` — cooperative cancellation
- `POST /api/tasks/{id}/approve` — supervised release approval
- `GET /api/memory`
- `GET /api/metrics` — worker capacity, active runs and latency statistics
- `POST /api/execute` — idempotency-aware, rate-limited execution submission

### Execute payload

```json
{
  "prompt": "Build a production-ready REST API for task management...",
  "mode": "autonomous"
}
```

Modes: `autonomous` and `supervised`.

Use an `Idempotency-Key` header for retry-safe submissions. Supervised runs pause after REVIEWER and remain in `AWAITING_APPROVAL` until explicitly approved. Request IDs are returned as `X-Request-ID` and execution events contain stable event IDs for trace correlation. The browser client retries transient stream failures with bounded exponential backoff and resumes using `Last-Event-ID`, so reconnects continue from the last delivered trace event instead of replaying the entire stream.

## Runtime modes and verification honesty

CYRUS emits stage-start and stage-completion events as each stage actually runs. The browser receives current task state and trace events over the resumable Server-Sent Events endpoint. Completed stage records are persisted after each update so progress is inspectable even after a reconnect.

Without a model key, CYRUS uses deterministic demo heuristics. With a key, it sends separate live Chat Completions requests for planning, engineering considerations, an implementation draft, a validation plan, and review. The model adapter does not browse the web, modify repository files, execute arbitrary generated code, or run tests. The UI/API therefore report proposed checks as `PLAN_GENERATED_NOT_EXECUTED`, leave test-pass and coverage values at zero, and label review scores as model estimates rather than verified test results. Provider errors fail the task visibly rather than quietly fabricating a successful model response.

The repository also includes a browser fallback bridge for a disconnected frontend demo. It does not mask failures when a remote API base URL has been configured.

### Browser demo

**GitHub Pages:** https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/

The static demo is designed to degrade gracefully: when the backend cannot be reached, the UI automatically falls back to the deterministic demo runtime rather than displaying a broken application.

### Runtime verification

For the full backend runtime, start Flask locally with `python server.py` and open `http://127.0.0.1:8000/`. The browser bridge only activates when API requests fail, so local backend execution remains the primary runtime.

## Hosted realtime backend

GitHub Pages serves static files only; it cannot host the Flask API, background workers, or live Server-Sent Events endpoint. This repository includes a Render Blueprint (render.yaml) that deploys Flask as a web service using Gunicorn, /api/health health checks, and CORS restricted to the GitHub Pages origin.

1. Open [Deploy CYRUS backend to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fmahitech580%2FCYRUS-Autonomous-Agentic-Intelligence-System) and authorize Render to access this repository.
2. Create and deploy the Blueprint. The configured service name is cyrus-agentic-api-mahitech580, with expected URL https://cyrus-agentic-api-mahitech580.onrender.com.
3. Once Render reports the service as Live, verify https://cyrus-agentic-api-mahitech580.onrender.com/api/health returns JSON with status "ok".
4. Open the GitHub Pages UI. Its API URL defaults to that Render hostname. Use API ↗ in the Home header or workspace toolbar to enter the actual service URL if Render assigned a different hostname.

The frontend calls the configured API for health, agents, tools, execution submission, task details, metrics, and the resumable event stream. When a live API URL is configured, the browser-demo bridge will not silently fabricate successful results after a network failure; the status remains offline until the actual backend responds.

### Render Free plan notes

Render's free web services can spin down after 15 minutes without inbound traffic; waking may take around a minute. Their local filesystem is ephemeral, so the current JSON execution history can be cleared when the instance spins down, restarts, or redeploys. For durable multi-user execution history, configure a managed persistent datastore (for example, PostgreSQL) rather than treating the free instance's local JSON file as permanent. See [Render free service limitations](https://render.com/docs/free).

## Provider configuration

The orchestration engine uses a provider adapter in `providers.py`. It supports OpenAI Chat Completions-compatible providers such as OpenAI and compatible gateways. Configure these environment variables in the Render service dashboard:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CYRUS_LLM_API_KEY` | Provider secret; never put this in GitHub or frontend JavaScript | unset |
| `CYRUS_LLM_PROVIDER` | `auto` selects live mode when a key exists; `deterministic` forces demo mode | `auto` |
| `CYRUS_LLM_BASE_URL` | HTTPS endpoint base URL, including any version path | `https://api.openai.com/v1` |
| `CYRUS_LLM_MODEL` | Model identifier accepted by the configured provider | `gpt-4o-mini` |
| `CYRUS_LLM_TIMEOUT_SECONDS` | Per-request timeout, bounded between 5 and 60 seconds | `25` |

`render.yaml` declares the API key as `sync: false`; for an already-created Render service, add `CYRUS_LLM_API_KEY` manually under **Environment** and redeploy. Render ignores newly added `sync: false` entries during Blueprint updates, so this manual step is expected. See the [Render Blueprint environment-variable reference](https://render.com/docs/blueprint-spec).

Check `GET /api/provider` to see which mode is active. A response with `"mode": "DEMO"` means the backend is live but no model key is configured. A response with `"mode": "LIVE"` means the model adapter is configured; model-provider availability is still confirmed only when a real task succeeds.

## Runtime controls

The server is production-safe by default: development debug mode is disabled unless `CYRUS_DEBUG=1`. Optional controls include `CYRUS_HOST`, `CYRUS_PORT`, `CYRUS_DEBUG`, `CYRUS_MAX_CONCURRENT_TASKS`, `CYRUS_MAX_LIVE_TASKS`, `CYRUS_MAX_REQUEST_BYTES`, `CYRUS_MAX_PROMPT_CHARS`, and `CYRUS_EXECUTIONS_PER_MINUTE`. The backend also uses an allowlist for public static assets so source and history files are not exposed by the Flask server.

## UI

The Command surface contains the objective editor, execution mode switch, seven-agent graph, metrics, live trace, and artifact explorer. The refreshed interface follows TripPilot's smoky charcoal surfaces, deep-red and travel-green accent system, soft-white typography and cinematic remote imagery. Its motion layer adds scroll-revealed sections, pointer-driven 3D card tilt, layered parallax imagery, a scroll-progress rail, an animated CSS 3D agent-core scene, floating wireframe cubes and orbit rings. Motion is disabled or softened when the user requests reduced motion, and the persistent Motion / Calm Mode switch provides an additional user-controlled override. Agents, Memory, Tools and History each have their own image-led hero, sectioned content and operational controls.

## Future improvements

- Provider adapters for multiple LLM vendors
- Real repository workspace execution
- Docker-backed isolated tool runtime
- Approval workflow persistence
- Postgres event store
- Authentication and multi-user workspaces
