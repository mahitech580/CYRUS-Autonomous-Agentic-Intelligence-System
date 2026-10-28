# CYRUS Frontend Reference Audit

**Research date:** 28 October 2026  
**Target:** CYRUS Engineering OS React/Vite frontend  
**Purpose:** Extract interaction and information-architecture patterns from real open-source agent, workflow, and observability projects. This is a reference audit—not a copy of their code or visual branding.

## Findings and what CYRUS should borrow

### 1. OpenHands — task-first coding-agent workspace
- Repository: https://github.com/OpenHands/OpenHands
- Source inspected: [home route](https://github.com/OpenHands/OpenHands/blob/main/src/routes/home.tsx), [conversation route](https://github.com/OpenHands/OpenHands/blob/main/src/routes/conversation.tsx), [conversation panel](https://github.com/OpenHands/OpenHands/blob/main/src/components/features/conversation-panel/conversation-panel.tsx)
- Pattern: the home screen foregrounds task entry and makes missing LLM configuration visible; active work has a dedicated conversation surface and contextual controls.
- CYRUS application: put the task composer before secondary dashboard metrics, make first-task briefs selectable, and show real setup state instead of fabricating activity. Keep the review/approval gate explicit.

### 2. Flowise — visual agent orchestration and execution inspection
- Repository: https://github.com/FlowiseAI/Flowise
- Source inspected: [reusable Agentflow canvas](https://github.com/FlowiseAI/Flowise/blob/main/packages/agentflow/src/Agentflow.tsx), [Agentflow canvas](https://github.com/FlowiseAI/Flowise/blob/main/packages/ui/src/views/agentflowsv2/Canvas.jsx), [execution details](https://github.com/FlowiseAI/Flowise/blob/main/packages/ui/src/views/agentexecutions/ExecutionDetails.jsx)
- Pattern: stages/nodes have individual status, connected execution context, and an inspectable tree of run details.
- CYRUS application: retain the seven-stage pipeline and expandable per-stage outputs. A free-form graph editor is not needed until users can actually customize orchestration; do not add a canvas only for decoration.

### 3. Langflow — contextual inspection and node validation
- Repository: https://github.com/langflow-ai/langflow
- Source inspected: [inspection panel](https://github.com/langflow-ai/langflow/blob/main/src/frontend/src/pages/FlowPage/components/InspectionPanel/index.tsx), [node status](https://github.com/langflow-ai/langflow/blob/main/src/frontend/src/CustomNodes/GenericNode/components/NodeStatus/index.tsx)
- Pattern: selection reveals a right-side inspector; node state distinguishes success, errors, inactive branches, and validation.
- CYRUS application: keep detailed stage output in the run drawer instead of flooding the Overview; make failures and blocked steps distinct from pending steps and avoid ambiguous generic green statuses.

### 4. Dify — separate agent configuration, logs, and monitoring
- Repository: https://github.com/langgenius/dify
- Source inspected: [agent detail router](https://github.com/langgenius/dify/blob/main/web/features/agent-v2/agent-detail/page.tsx), [configure route](https://github.com/langgenius/dify/blob/main/web/app/%28commonLayout%29/agents/%5BagentId%5D/configure/page.tsx), [logs route](https://github.com/langgenius/dify/blob/main/web/app/%28commonLayout%29/agents/%5BagentId%5D/logs/page.tsx), [monitoring route](https://github.com/langgenius/dify/blob/main/web/app/%28commonLayout%29/agents/%5BagentId%5D/monitoring/page.tsx)
- Pattern: configuration, access, execution logs, and monitoring are separate destinations.
- CYRUS application: keep Settings, Runs, Code review, and Deployments distinct. Don't mix credentials into the run timeline or label an adapter as a connected integration when it is not.

### 5. Temporal UI — execution history as operational evidence
- Repository: https://github.com/temporalio/ui
- Source inspected: [workflow detail component](https://github.com/temporalio/ui/blob/main/src/lib/components/workflow/workflow-detail.svelte), [workflow table](https://github.com/temporalio/ui/blob/main/src/lib/components/workflow/workflows-summary-configurable-table.svelte), [workflow action controls](https://github.com/temporalio/ui/blob/main/src/lib/components/workflow-actions.svelte)
- Pattern: workflow lists support filtering/sorting; individual executions expose structured event history and deliberate controls such as pause/cancel/reset with confirmation where appropriate.
- CYRUS application: use persisted events and saved outputs as the source of truth; retain status filters, manual refresh, cancel, and explicit human decisions. Telemetry should be computed from saved runs only.

### 6. n8n — readable, expandable AI activity steps
- Repository: https://github.com/n8n-io/n8n
- Source inspected: [AI activity step](https://github.com/n8n-io/n8n/blob/master/packages/frontend/%40n8n/design-system/src/components/N8nAiActivityStep/AiActivityStep.vue)
- Pattern: activity stages are compact when collapsed and reveal content or actionable error detail on expansion; nested steps have a visual rail.
- CYRUS application: keep the seven agent stages scannable while exposing the full artifact, failure message, and event details on demand. Respect reduced-motion preferences.

### 7. Browser Use Web UI — agent and browser settings as explicit configuration
- Repository: https://github.com/browser-use/web-ui
- Source inspected: [agent settings tab](https://github.com/browser-use/web-ui/blob/main/src/webui/components/agent_settings_tab.py), [browser settings tab](https://github.com/browser-use/web-ui/blob/main/src/webui/components/browser_settings_tab.py), [agent run tab](https://github.com/browser-use/web-ui/blob/main/src/webui/components/browser_use_agent_tab.py)
- Pattern: model/agent behavior settings are separate from browser/runtime controls and the actual run interface.
- CYRUS application: keep server credentials and deployment settings separate from task content. Show configuration blockers with direct instructions; don't pretend a connected runtime exists before health checks pass.

### 8. Langfuse — trace hierarchy and observability
- Repository: https://github.com/langfuse/langfuse
- Source inspected: [trace page](https://github.com/langfuse/langfuse/blob/main/web/src/features/traces/TracePage.tsx), [trace graph view](https://github.com/langfuse/langfuse/blob/main/web/src/features/trace-graph-view/components/TraceGraphView.tsx), [graph node](https://github.com/langfuse/langfuse/blob/main/web/src/features/trace-graph-view/components/GraphNode.tsx), [session timeline row](https://github.com/langfuse/langfuse/blob/main/web/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedConversationTimeline/components/SessionConversationTimeline/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow.tsx)
- Pattern: observability is a hierarchical trace with expandable spans, contextual status, and links between a parent task and nested activity—not just a row of colorful counters.
- CYRUS application: keep the saved event timeline, stage-specific artifacts, and run-level metadata together so users can explain what happened after a workflow fails.

### 9. CrewAI + AG-UI / CopilotKit — approvals and stateful live UI
- Project/docs: https://github.com/crewAIInc/crewAI and [frontend overview](https://github.com/crewAIInc/crewAI/blob/main/docs/v1.15.25/en/guides/frontend/overview.mdx)
- Pattern: render agent events and structured state in purpose-built UI, collect user input/approval when execution pauses, and maintain a clear boundary between frontend rendering and agent runtime.
- CYRUS application: approval must remain a real persisted decision, not a cosmetic button; provider credentials and execution belong on the server. The current product intentionally does not execute generated code or deploy it automatically.

### 10. LibreChat — agent configuration discoverability
- Project/docs: https://github.com/LibreChat-AI/LibreChat and [Agents documentation](https://www.librechat.ai/docs/features/agents)
- Pattern: agent configuration exposes name, purpose/instructions, and model selection in one recognizable builder rather than burying every option in a general settings page.
- CYRUS application: if configurable agent profiles are added later, give each role a dedicated configuration and preview surface. Do not show “configure agent” as a working action until it saves an actual profile.

## Decisions applied in CYRUS

- The Overview now prioritizes the task composer and editable brief starters over KPI metrics.
- Starter briefs prefill the prompt only; they do not fabricate saved runs or claim tests were executed.
- The launch-readiness checklist sits after the task entry area and reports API, access, provider, and durable-storage state from the backend response.
- The sidebar's made-up `58%` capacity/utilization indicator was removed; status now reflects runtime readiness and links to the next action.
- Existing run history, stage artifacts, event history, cancellation, approval, filters, CSV export, and report export remain grounded in persisted data.
- Styling keeps CYRUS's own visual identity; no reference project's branded assets or source implementation are copied.

## Scope limits discovered during research

The repositories have different runtimes and product scopes. In particular, a workflow graph editor is useful for user-defined pipelines, whereas CYRUS currently runs one fixed seven-stage process. Copying a visual builder without the corresponding data model and API would be decorative rather than functional. Likewise, a detailed observability graph should wait for real span/dependency data; current CYRUS event rows should not be drawn as a synthetic trace graph.

## Reproducible source links

All links above point to source paths or project documentation so follow-up work can compare behavior, not rely on screenshots alone. Upstream paths and default branches may change.
