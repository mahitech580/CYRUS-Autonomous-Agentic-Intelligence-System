# CYRUS frontend reference review

Reviewed on 2026-10-28 to guide interface improvements for the CYRUS Engineering OS. These are design and interaction references, not copied source code. CYRUS retains its own implementation, naming, visual language, API contracts, and safety boundaries.

## Repositories inspected

| Reference | Frontend implementation examined | Useful lesson for CYRUS |
|---|---|---|
| [Dify](https://github.com/langgenius/dify) | App overview, workflow route, and app-detail sidebar | Separate the user's goal, workflow design, run logs, monitoring, and deployment concerns; keep the active task and next action clear. |
| [n8n](https://github.com/n8n-io/n8n) | `packages/frontend/editor-ui/src/app/components/layouts/ResourcesListEmptyState.vue`, `EmptyStateLayout.vue`, and `packages/frontend/@n8n/design-system/src/components/N8nEmptyState/EmptyState.vue` | An empty state is a purposeful screen: use the right icon, clear explanation, a specific CTA, and a reason/tooltip when the CTA is disabled. Avoid generic “nothing here” copy. |
| [Langflow](https://github.com/langflow-ai/langflow) | Frontend canvas, node-status indicators, and canvas controls | Show workflow stages as connected, readable units; make run states and validation visible at the point where users inspect the workflow. |
| [OpenHands Agent Canvas](https://github.com/OpenHands/OpenHands) | Project README and Agent Canvas screenshot/documentation | Give the agent a task-oriented workspace with clear handoffs into plan, files, and preview instead of treating the app as a collection of metrics. |
| [Opik](https://github.com/comet-ml/opik) | `apps/opik-frontend/src/v2/pages-shared/traces/TraceDetailsPanel/TraceDetailsPanel.tsx`, `PageEmptyState.tsx`, and `DataTableEmptyState.tsx` | Keep trace/run inspection in a structured detail panel; pair empty views with a quickstart/docs path, not a dead end. Preserve hierarchical step context and raw outputs. |
| [Langfuse](https://github.com/langfuse/langfuse) | `web/src/features/traces/TracesPage.tsx`, `web/src/components/nav/AppSidebar/AppSidebar.tsx`, and shared page shell | Distinguish “not configured yet” onboarding from the normal populated view; use consistent page headers and context-specific help. |
| [Flowise](https://github.com/FlowiseAI/Flowise) | `packages/ui/src/views/agentexecutions/ExecutionDetails.jsx` and `packages/ui/src/layout/MainLayout/Sidebar/index.jsx` | Represent execution as an expandable tree with explicit success, failure, timeout, and running states; let users inspect the step responsible for an outcome. |
| [Open WebUI](https://github.com/open-webui/open-webui) | Repository frontend structure for model, workspace, and integration settings | Keep provider setup, connections, and workspace configuration discoverable without mixing secrets into task composition. |
| [Plane](https://github.com/makeplane/plane) | `apps/web/core/components/common/new-empty-state.tsx` and project navigation | Use consistent workspace navigation, clear page hierarchy, and a primary action in empty states; maintain responsive behavior instead of shrinking desktop layouts. |
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | Platform flow editor, run graph, and execution-state components | Show the lifecycle close to the graph and make each stage's current execution state visible; avoid claiming an agent is executing merely because a role exists. |
| [TraceBloom](https://github.com/hugo-vicente11/TraceBloom) | Project overview and agent trace-viewer documentation | Treat agent observability as real event/trace data: tool steps, retries, failures, timing, and evaluation outcomes should be traceable to a run. |

## Design decisions applied to CYRUS

1. **Readiness must be truthful.** The sidebar no longer displays a hard-coded utilization percentage. Runtime readiness must come from the backend configuration checks.
2. **Setup has a path, not just a warning.** The Overview checklist separates API reachability, access control, model provider, and durable storage. The submit action directs the user to Settings when the live run prerequisites are missing.
3. **The first run is the main onboarding event.** Example prompts can populate the composer, and the recent-runs empty state provides an explicit setup or task action.
4. **Empty states explain what happens next.** If saved runs exist but filters exclude them, users can clear filters instead of seeing a misleading first-run message.
5. **Execution status is not role registration.** The fleet card labels configured roles and pipeline stages separately from runtime readiness. A registered specialist does not imply it is currently active.
6. **Inspectability comes before decorative telemetry.** Run status, persisted stage artifacts, and execution events are more valuable than invented activity charts or synthetic percentages.
7. **Readable at desktop and mobile sizes.** Navigation and run details stay responsive, keyboard focus remains visible, and reduced-motion preferences remain honored.

## Live CI run view (22 November 2026)

The Delivery / CI pipeline destination reads the public repository's latest GitHub Actions workflow-run records instead of presenting configured checks as though they were current results.

- Data source: [GitHub REST API — list workflow runs for a repository](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository).
- Request: `GET /repos/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs?per_page=12`.
- The repository is public, so this read-only endpoint can be queried without a browser token. No GitHub credential or write permission is stored in the frontend.
- The view labels the latest returned window separately from the repository-wide `total_count`, links each result to its exact Actions run, and links valid commit SHAs to the corresponding commit.
- Search and status filters operate only on the returned records. Refresh, loading, empty, malformed-response, network-error and unauthenticated rate-limit states are explicit.
- The UI does not rerun or cancel workflows, and it does not claim a configured workflow is passing. A result is marked passed only when GitHub returns a completed run with a `success` conclusion.

Unauthenticated public API requests are subject to GitHub's rate limits. If the API is unavailable, the page keeps the last successfully loaded snapshot and links to the repository's Actions history.

## Run-record metadata semantics (23 November 2026)

The backend's `agent_count` field is currently the size of the configured specialist registry (`len(AGENTS)`), not evidence that every specialist executed in a particular workflow. Run-list rows therefore use the persisted per-run `stage_count` instead of presenting the registry size as agents used. Review history uses validated persisted `stage_count` and `event_count` values. Missing or malformed counts and timestamps are shown as unavailable rather than inferred as zero or “Just now”.

## Next product-quality priorities

- Add a first-run walkthrough after production readiness is configured, including one small example run with user consent and real provider output.
- Make the seven-stage run view the primary monitoring surface, with stage durations, status, output preview, and failure details only when returned by the API.
- Continue using persisted API data for counts and telemetry; show skeleton/loading, empty, error, and ready states explicitly.
- Introduce a light theme only as a deliberate design-system feature with tested contrast, not as a quick inversion of dark-mode colors.
- Validate the overview and setup flow at common viewport widths and with keyboard-only navigation before adding further visual decoration.


## Activity stream history pagination (24 November 2026)

The Activity Stream now pages saved workflow summaries in batches of eight. The first unfiltered `GET /api/runs` response captures a server-side `snapshot_at`; later pages pass that exact value so newly created workflows cannot shift offset-based results or duplicate/skip a row. The UI loads retained events only for the selected page, keeps the search window explicit (newest 200 merged events), and lets the operator load older workflow summaries deliberately. This remains a read-only aggregation of per-run event records, not a global tracing or audit service.

Engineering references:
- [FastAPI query parameters](https://fastapi.tiangolo.com/tutorial/query-params/) — typed, bounded pagination and snapshot query inputs.
- [SQLAlchemy 2.0 SELECT statements](https://docs.sqlalchemy.org/en/20/core/selectable.html) — deterministic ordering and filtering before applying offsets and limits.
