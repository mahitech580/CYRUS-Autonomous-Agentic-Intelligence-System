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
- SQLite/PostgreSQL execution history and runtime telemetry

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

## Execution reports

The Execution History page exports filtered summary rows as CSV. Open any execution record to inspect the full run, then use **Export JSON** to download a versioned report containing allowlisted task fields, review findings, artifacts, and trace. Credential-like fields are stripped recursively, and common secret-like values in free text are replaced with redaction markers. Detection covers several common provider, cloud, GitHub, Google, Slack, JWT, bearer-token, and private-key patterns. A warning list identifies the affected field paths without echoing the detected value. This is heuristic protection, not a guarantee that every secret will be detected; review the file before sharing. The execution modal also supports copying the sanitized Markdown report to the clipboard when browser permissions allow it. The execution modal also offers **Export MD** for a readable Markdown report with metrics, agent stages, static-analysis checks, artifacts, the event trace, and the implementation draft. The Markdown format preserves the distinction between proposed checks and verified tests. It also supports **Export CSV** for a two-column, spreadsheet-compatible execution summary, plus **Copy JSON** and **Copy MD** when clipboard permissions allow it. CSV and JSON exports use the same credential-field filtering and free-text redaction checks.

## REST API

- `GET /api/health` — liveness, provider and capacity telemetry
- `GET /api/provider` — active provider capabilities, without exposing credentials
- `GET /api/ready` — deployment readiness probe (returns 503 when workers are saturated)
- `GET /api/security` — API protection configuration without exposing the access key
- `GET /api/agents`
- `GET /api/tools`
- `GET /api/tasks` — compact list with `limit`, `offset`, `status`, `mode`, and `q` filters
- `GET /api/analytics?days=7` — dynamic outcomes, daily run counts, providers, failures, latency, retry recovery by attempt depth, and storage diagnostics (1–90 day windows)
- `GET /api/tasks/{id}` — full execution record including agent state and trace
- `GET /api/tasks/{id}/recovery` — deterministic, status-aware next-step advice that never reflects raw failure text
- `GET /api/tasks/{id}/lineage` — bounded, summary-only original-to-retry attempt chain (maximum 50 records)
- `GET /api/tasks/{id}/stream` — resumable Server-Sent Events stream for live state and trace updates
- `POST /api/tasks/{id}/cancel` — cooperative cancellation
- `POST /api/tasks/{id}/approve` — supervised release approval
- `POST /api/tasks/{id}/retry` — bounded, idempotency-aware retry for failed, cancelled, or timed-out tasks
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

Use an `Idempotency-Key` header for retry-safe submissions. The **Retry execution** action creates a new task only when the previous attempt is `FAILED`, `CANCELLED`, or `TIMED_OUT`; it preserves the objective and mode but creates a fresh task ID and event trace. The API records `parent_task_id`, `retry_number`, and a safe `retry_reason` so retry ancestry survives history reloads and appears in JSON, Markdown, and CSV reports. The `GET /api/tasks/{id}/recovery` endpoint maps the saved status and safe failure type to deterministic next steps for timeouts, provider/configuration failures, cancellations, completed runs, and synthetic demos. It excludes raw failure messages and credential values; it is guidance, not an automated diagnosis. The `GET /api/tasks/{id}/lineage` endpoint returns a bounded (50-attempt maximum), summary-only view of the connected retry graph; the execution inspector renders the complete available timeline and allows operators to open any attempt. Within the current single-worker deployment, a source task gets at most one direct retry child, so a lost response or repeat click cannot create parallel siblings. The reservation is process-local; use shared transactional coordination before deploying multiple application workers or instances. Retries are explicit—not automatic provider replays—and they do not inherit old artifacts or imply that previous checks passed. Configure `CYRUS_MAX_TASK_RETRIES` between 0 and 10 (default `3`; `0` disables retries). Each lineage records its original cap, while the active deployment cap can tighten but never expand the retry budget for that lineage. API detail/list responses and JSON, Markdown, and CSV exports show both the recorded and effective caps. See [Task retry and recovery policy](docs/TASK_RECOVERY.md).

Supervised runs pause after REVIEWER and remain in `AWAITING_APPROVAL` until explicitly approved. Request IDs are returned as `X-Request-ID` and execution events contain stable event IDs for trace correlation. The browser client retries transient stream failures with bounded exponential backoff and resumes using `Last-Event-ID`, so reconnects continue from the last delivered trace event instead of replaying the entire stream.

## Runtime modes and verification honesty

CYRUS emits stage-start and stage-completion events as each stage actually runs. The browser receives current task state and trace events over the resumable Server-Sent Events endpoint. Completed stage records are persisted after each update so progress is inspectable even after a reconnect. Long-running jobs check for cancellation between provider calls and have a configurable task deadline.

At the TESTER stage, CYRUS executes non-destructive static checks over the generated draft: output-size and code-fence checks, Python syntax parsing with `ast.parse`, high-confidence secret-pattern screening, and review warnings for common dynamic/process-execution primitives. It never executes generated Python. The report is saved as `static-analysis.json` and displayed in the task detail view. Proposed application tests remain explicitly unexecuted and coverage remains zero until an actual sandbox is added.

Without a model key, CYRUS uses deterministic demo heuristics. With a key, it sends separate live Chat Completions requests for planning, engineering considerations, an implementation draft, a validation plan, and review. The model adapter does not browse the web, modify repository files, execute arbitrary generated code, or run tests. The UI/API therefore report proposed checks as `PLAN_GENERATED_NOT_EXECUTED`, leave test-pass and coverage values at zero, and label review scores as model estimates rather than verified test results. Provider errors fail the task visibly rather than quietly fabricating a successful model response. The task inspector also requests deterministic recovery guidance by task ID. Failure types are tokenized before classification to avoid substring mistakes; quota, throttling, and HTTP 429 failures have a dedicated `rate_limited` path with reset-window advice, while unknown types fall back to trace inspection. Raw error messages are not reflected in the guidance response. `PREPARE RECOVERY OBJECTIVE` copies the original objective and recommended checks into Command for review; it preserves the mode, does not submit the request, and does not claim a retry ran.

The repository retains a deterministic browser simulator for disconnected demos. Open the GitHub Pages URL with `?demo=1` to opt in. In this mode the bridge intercepts API calls before they can leave the browser, labels every run as synthetic, and stores records only in that browser's local storage. Use the Command prompt phrase `simulate failure` to create a controlled failed run, or `simulate timeout` to create a synthetic `TIMED_OUT` record. Both let you exercise explicit retry, lineage, and recovery-analytics flows without provider calls or user-code execution. **EXPORT LOCAL HISTORY** downloads a versioned JSON archive built from the existing sanitized task-report allowlist; credential-like fields are omitted, common secret-like text is redacted heuristically, and warnings are included because free-text detection is not exhaustive. The archive contains only browser-demo records retained in the current profile. The **CLEAR LOCAL HISTORY** control asks for confirmation, then removes only browser-demo records and their idempotency cache; it never contacts or deletes backend history. This is a UI/workflow demo: it does not call a model provider, execute generated code, verify app correctness, or store data on the backend.

Without `?demo=1`, the UI connects to the configured remote API. A configured remote backend outage is not silently replaced with synthetic success; the UI reports the connection issue and lets the operator correct API settings.

For the local simulator’s routes, synthetic scenarios, archive format, retention caps, and reset behavior, see [Browser Demo Guide](docs/BROWSER_DEMO.md).

### Browser deployment

**GitHub Pages:** https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/

GitHub Pages hosts the static UI only. For a clearly labeled offline tour, open [the browser demo](https://mahitech580.github.io/CYRUS-Autonomous-Agentic-Intelligence-System/?demo=1); tasks and metrics are synthetic and remain in that browser profile. For real execution, task history, metrics, and the event stream, use the configured reachable backend and remove `?demo=1`.

### Runtime verification

For the full backend runtime, start Flask locally with `python server.py` and open `http://127.0.0.1:8000/` **without** `?demo=1`. That keeps API traffic on the local server. Adding `?demo=1` intentionally switches the page to a local synthetic simulator and bypasses the backend, even when the backend is reachable.

## Hosted realtime backend

GitHub Pages serves static files only; it cannot host the Flask API, background workers, or live Server-Sent Events endpoint. This repository includes a Render Blueprint (render.yaml) that deploys Flask as a web service using Gunicorn, /api/health health checks, and CORS restricted to the GitHub Pages origin.

1. Open [Deploy CYRUS backend to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fmahitech580%2FCYRUS-Autonomous-Agentic-Intelligence-System) and authorize Render to access this repository.
2. Create and deploy the Blueprint. The configured service name is cyrus-agentic-api-mahitech580, with expected URL https://cyrus-agentic-api-mahitech580.onrender.com.
3. Once Render reports the service as Live, verify https://cyrus-agentic-api-mahitech580.onrender.com/api/health returns JSON with status "ok".
4. Open the GitHub Pages UI. Its API URL defaults to that Render hostname. Use API ↗ in the Home header or workspace toolbar to enter the actual service URL if Render assigned a different hostname.

The frontend calls the configured API for health, agents, tools, execution submission, task details, metrics, and the resumable event stream. When a live API URL is configured, the browser-demo bridge will not silently fabricate successful results after a network failure; the status remains offline until the actual backend responds.

### Render Free plan notes

Render's free web services can spin down after 15 minutes without inbound traffic; waking may take around a minute. The local SQLite file is still on the service filesystem and can be lost after a restart or redeploy. For durable hosted history, set `CYRUS_DATABASE_URL` to a managed PostgreSQL connection string; changing the code to use SQLite alone does not make ephemeral-host data durable. See [Render free service limitations](https://render.com/docs/free).

At process startup, persisted runs left in `RUNNING`, `QUEUED`, or `AWAITING_APPROVAL` are marked `FAILED` with `RuntimeRestart` and `INTERRUPTED_NOT_VERIFIED`. This avoids presenting work as active after the worker and approval signal have disappeared. It does not resume the interrupted work automatically; start a new task after inspecting the partial artifacts.

## Database-backed execution history

The history adapter stores full execution snapshots, artifacts, agent traces, status changes and idempotency metadata in a database table. Local development defaults to SQLite at `cyrus_history.sqlite3`; set `CYRUS_DATABASE_PATH` to move the file. On a deployed host, set `CYRUS_DATABASE_URL` or `DATABASE_URL` to a PostgreSQL connection string to use PostgreSQL. The database driver is installed through `requirements.txt`.

The Render Blueprint declares `CYRUS_DATABASE_URL` as an unsynchronized secret. For an existing service, add it under **Render → Service → Environment** and redeploy. Keep the database connection string private. When the database is empty and a legacy `cyrus_history.json` exists, CYRUS attempts a one-time import. History is capped to the latest 100 execution records by default.

The new Analytics workspace refreshes `GET /api/analytics` every 20 seconds and supports 7-, 30-, and 90-day activity windows. Values are computed from stored task records plus live tasks; an empty history produces empty charts, not sample runs. The API diagnostics report which history store is active and whether the hosted SQLite filesystem is ephemeral. The same response includes `retry_outcomes`: retry-attempt status totals and a depth-by-depth breakdown, plus the number of resolved retry attempts that completed after an unsuccessful parent attempt. Retry completion rate excludes nonterminal attempts; recovery rate uses only resolved child attempts whose parent ended unsuccessfully. These metrics describe recorded executions and do not claim that generated code or proposed tests ran.

## Provider configuration

The orchestration engine uses a provider adapter in `providers.py`. It supports OpenAI Chat Completions-compatible providers such as OpenAI and compatible gateways. Configure these environment variables in the Render service dashboard:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CYRUS_API_ACCESS_KEY` | Optional shared secret that gates private API routes; set before enabling a paid model key | unset |
| `CYRUS_LLM_API_KEY` | Provider secret; never put this in GitHub or frontend JavaScript | unset |
| `CYRUS_LLM_PROVIDER` | `auto` selects live mode when a key exists; `deterministic` forces demo mode | `auto` |
| `CYRUS_LLM_BASE_URL` | HTTPS endpoint base URL, including any version path | `https://api.openai.com/v1` |
| `CYRUS_LLM_MODEL` | Model identifier accepted by the configured provider | `gpt-4o-mini` |
| `CYRUS_LLM_TIMEOUT_SECONDS` | Per-request timeout, bounded between 5 and 60 seconds | `25` |
| `CYRUS_MAX_TASK_RETRIES` | Maximum explicit retry depth for a task lineage (0 disables retries; bounded 0–10) | `3` |

Provider endpoint URLs are validated before use: remote endpoints require HTTPS, plain HTTP is allowed only for real loopback hosts, and credentials in URL user-info/query/fragment fields are rejected. Live responses are limited to 2,000,000 bytes and upstream error details are scrubbed for common credential patterns. See [Provider adapter security](docs/PROVIDER_SECURITY.md) for the limits and their caveats.

`render.yaml` declares the model, API access, and database connection settings as host-managed values/secrets. For an already-created Render service, add missing secret entries manually under **Environment** and redeploy. If a live model key is present without `CYRUS_API_ACCESS_KEY`, private routes now fail closed instead of allowing anonymous model usage. In particular, set `CYRUS_API_ACCESS_KEY` to a long random value before adding `CYRUS_LLM_API_KEY`; otherwise anyone who finds the public API URL may be able to submit work against a configured provider key. When access-key protection is enabled, the API ↗ settings dialog accepts the access key and keeps it in tab-scoped session storage; it is sent only in the `X-CYRUS-Access-Key` request header. Health, readiness, and provider-capability endpoints remain public for probes. Never reuse the model-provider secret as the API access key.

Render ignores newly added `sync: false` entries during Blueprint updates, so this manual step is expected. See the [Render Blueprint environment-variable reference](https://render.com/docs/blueprint-spec).

Check `GET /api/provider` to see which mode is active. A response with `"mode": "DEMO"` means the backend is live but no model key is configured. A response with `"mode": "LIVE"` means the model adapter is configured; model-provider availability is still confirmed only when a real task succeeds.

## Runtime controls

The server is production-safe by default: development debug mode is disabled unless `CYRUS_DEBUG=1`. Optional controls include `CYRUS_HOST`, `CYRUS_PORT`, `CYRUS_DEBUG`, `CYRUS_API_ACCESS_KEY`, `CYRUS_TASK_TIMEOUT_SECONDS`, `CYRUS_MAX_CONCURRENT_TASKS`, `CYRUS_MAX_LIVE_TASKS`, `CYRUS_MAX_REQUEST_BYTES`, `CYRUS_MAX_PROMPT_CHARS`, and `CYRUS_EXECUTIONS_PER_MINUTE`. The backend also uses an allowlist for public static assets so source and history files are not exposed by the Flask server. The per-process execution rate limiter also caps tracked client keys at 1,000; it is not a distributed quota, so see [API rate-limiting behavior](docs/RATE_LIMITING.md) before scaling to multiple instances.

## UI

The Command surface contains the objective editor, execution mode switch, seven-agent graph, metrics, live trace, and artifact explorer. The Analytics workspace adds database-backed daily activity, outcome rates, provider distribution, failure signatures and latency summaries. The refreshed interface follows TripPilot's smoky charcoal surfaces, deep-red and travel-green accent system, soft-white typography and cinematic remote imagery. Its motion layer adds scroll-revealed sections, pointer-driven 3D card tilt, layered parallax imagery, a scroll-progress rail, an animated CSS 3D agent-core scene, floating wireframe cubes and orbit rings. Motion is disabled or softened when the user requests reduced motion, and the persistent Motion / Calm Mode switch provides an additional user-controlled override. Agents, Memory, Tools and History each have their own image-led hero, sectioned content and operational controls.

The Atmosphere Studio adds five persistent color fields—Nexus, Aurora, Solar Flare, Ultraviolet and Monochrome—and four independently selectable procedural background modes—Living Nebula, Aurora Waves, Signal Grid and Constellation—plus a live 25–140% intensity/particle-density slider. A procedural canvas creates slow nebula light, connected particle constellations, and pointer-reactive glow without requiring a large background-video asset. The field pauses while the tab is hidden, caps its pixel ratio and animation cadence, reduces particle count for smaller hardware, and respects browser reduced-motion and data-saver preferences. The current visual preset also updates the browser theme color on supported mobile browsers. Open it using **✧ ATMOSPHERE** in a workspace, **✧ FX** on the home page, or **Open Atmosphere Studio** in the command palette. Color preset, field mode and intensity preferences are saved locally.

## Command palette operator controls

The command palette now exposes common visual and accessibility changes without navigating through settings:

- **Cycle Background Mode** moves between Living Nebula, Aurora Waves, Signal Grid and Constellation.
- **Enable Calm Mode / Enable Immersive Motion** toggles animation while preserving the system reduced-motion preference.
- **Increase / Decrease Background Intensity** adjusts the ambient layer in 15-point increments, clamped to the supported 25–140% range.
- **Reset Atmosphere Defaults** restores the Nexus color preset, Living Nebula mode and 80% intensity.
- Search also matches descriptive keywords such as `calm`, `constellation`, `dim`, `restore` and `animation`.

Use the Up/Down arrows to navigate results, Enter to run the selected command, and Escape to close the palette. The controls reuse the same saved preferences as Atmosphere Studio, so changes persist consistently across both entry points.

## Future improvements

- Provider adapters for multiple LLM vendors
- Real repository workspace execution
- Docker-backed isolated tool runtime
- Approval workflow persistence
- Dedicated append-only event/audit store
- Authentication and multi-user workspaces
