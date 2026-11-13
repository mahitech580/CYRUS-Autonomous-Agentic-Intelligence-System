# CYRUS visual system and image references

Last updated: 13 November 2026

This note records the visual direction and externally hosted image sources used by the React workspace. The implementation is original CYRUS UI code; references inform information hierarchy and interaction patterns rather than supplying copied components or branding.

## Visual direction

- **Base:** midnight navy surfaces with a low-contrast global grid and restrained Earth-at-night backdrop.
- **Accents:** electric cyan for active/runtime focus, periwinkle blue for technical information, violet for secondary emphasis, and mint for successful states.
- **Surface treatment:** layered glass-like panels, quiet borders, soft gradients and limited glow. The task composer and run details remain the primary work surfaces.
- **Motion:** short hover transitions and a slow photographic hero drift. All animation is disabled for users who request reduced motion.
- **Responsive behavior:** the hero becomes a single column, task briefs stack, metric/fleet cards collapse, and the pipeline becomes horizontally scrollable on narrow viewports.
- **Truthfulness:** all status text continues to come from API state. Image artwork and decorative activity never imply a live worker, provider, deployment or successful run.

## Image references

The app requests images from Unsplash's image CDN. No copies are stored in this repository.

| Use | Image | Source |
|---|---|---|
| Overview hero | illuminated data-center racks | https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85 |
| Task brief: build | computer hardware / circuit board | https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=720&q=80 |
| Task brief: investigate | code on a display | https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=720&q=80 |
| Task brief: review | analytics dashboard | https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=720&q=80 |
| Workspace backdrop | Earth at night | https://images.unsplash.com/photo-1663160055679-7b7fecb4468f?auto=format&fit=crop&w=2000&q=70 |

Images are decorative context; important UI meaning is also expressed in text, labels, and status indicators. The hero includes descriptive alternative text. Task-card images are decorative (empty alt text) because each card already has a clear text label. The task images are lazy-loaded and each has a solid gradient fallback beneath it.

## License and maintenance

Unsplash's published license: https://unsplash.com/license

The Unsplash license permits broad use of downloaded images, including commercial and non-commercial use; attribution is appreciated but not required. CYRUS links to the license from the hero image. If a source URL is removed, replace it with a verified source and update this record. Do not hotlink a third-party image that has an unclear license or copy a reference product's logo, screenshot or proprietary UI assets.

## Interaction references

The existing frontend research notes remain the source for deeper product/interaction references:

- [Frontend reference research](./ui-reference-research.md)
- [Frontend reference audit](./FRONTEND_REFERENCE_AUDIT.md)

Projects studied include [OpenHands](https://github.com/OpenHands/OpenHands), [Dify](https://github.com/langgenius/dify), [Flowise](https://github.com/FlowiseAI/Flowise), [Langflow](https://github.com/langflow-ai/langflow), [Langfuse](https://github.com/langfuse/langfuse), [n8n](https://github.com/n8n-io/n8n) and [Temporal UI](https://github.com/temporalio/ui). These are used as interaction references only.


## Page navigation and operational page headers

The workspace sidebar now uses ordinary anchor destinations for Overview, Agent fleet, Runs & tasks, Code review, Deployments, Integrations, and Settings. The destinations are shareable hash routes (for example, `#/agents` and `#/review`) so the same static build works on Vercel and GitHub Pages without requiring a server-side rewrite. Browser back/forward navigation stays synchronized with the active page, and the top-bar New task link opens the run composer directly.

Operational pages use a consistent icon-led masthead with low-contrast photographic context. The mastheads reuse the five Unsplash sources already listed above; no unlicensed assets or copied product screenshots were added. Header photos are decorative, use empty alternative text, lazy loading, and a gradient fallback. Readiness, run state, approvals, and deployment claims continue to come from the API rather than the imagery.


## Multi-page workspace information architecture

Updated: 12 November 2026

The workspace exposes 36 direct hash destinations in nine navigation groups. Hash routes preserve static GitHub Pages hosting and support shareable destinations, browser back/forward and direct page entry. Native anchors handle page navigation; grouped navigation uses native disclosure controls rather than application-menu roles.

| Group | Pages |
|---|---|
| Workspace | Overview, Launchpad |
| Agents | Agent fleet, Atlas, Scout, Forma, Forge, Sentinel, Lens, Orbit |
| Execution | Runs & tasks, Active runs, Run history, Prompt library |
| Quality | Code review, Review history |
| Delivery | Deployments, Workspace app, API service, CI pipeline |
| Integrations | Integrations, AI provider, Web research, GitHub source, Database |
| Observability | Observability, Activity stream, Queue monitor, Usage & tokens |
| Governance | Governance, Safety policies, Workflow audit log |
| Settings | Settings, Runtime health, Workspace access, Appearance |

### Page and data boundaries

- Existing root views keep their API-backed React components.
- Agent profiles describe the seven fixed backend roles; they are not editable because the current API has no role-edit operation.
- Active/history/review views filter currently loaded API records and link to the paginated run list.
- Queue, provider, database, access and worker signals come from the runtime endpoint. Unknown values remain unknown.
- Usage shows token counts only when saved stage usage exists; no dollar cost is estimated without pricing and complete data.
- Workflow audit is labelled as a workflow-record summary, not an identity or credential audit service.
- CI links to actual workflow history and does not show fabricated live check states.
- Selecting a task brief only prefills the existing composer. It never starts a run automatically.
- Approval is a recorded human decision; generated code is not executed, GitHub is not written by agents, and approval does not deploy.

### Research references

- [React Router route configuration](https://reactrouter.com/start/data/routing) and [Link component](https://reactrouter.com/main/api/components/Link) — route objects, nested destinations and ordinary link semantics. CYRUS retains hash routing for static hosting.
- [Dify workflows](https://dify.ai/workflows) — inspectable execution paths and human review checkpoints.
- [Agno agentic platform starter](https://github.com/bruceherve/agno-agentic-platform-starter) — practical groupings for sessions, metrics, approvals, schedules, traces and settings.
- [Temporal agent harness](https://github.com/temporal-community/temporal-agent-harness) — durable execution, approval pauses and workflow observability.
- [W3C disclosure navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) — native disclosure controls combined with ordinary navigation links.
- [web.dev navigation guidance](https://web.dev/articles/website-navigation) — semantic landmarks and predictable navigation behavior.

The page mastheads reuse the documented Unsplash image sources above. Images are decorative, use empty alternative text and lazy loading, and sit over a gradient fallback; route meaning and live state remain text and API-derived.

## Keyboard page switcher

The 36 registered hash destinations are searchable from the top bar or with **Ctrl+K / Cmd+K**. Search matches all query terms across page labels, route paths, navigation groups, route IDs and view names, with case, accent and punctuation normalization. The global shortcut does not intercept typing in inputs, textareas, selects or editable regions, and ignores extra modifiers and key-repeat events. Arrow keys move the active result, Enter opens it, and Escape or the visible close control dismisses the dialog. Selecting a result uses the existing hash route, so direct links and browser history keep their current behavior; the switcher does not start a workflow or call the API.

The switcher uses the native modal `<dialog>` opened with `showModal()` so the browser manages the modal layer, background inertness, initial focus and return focus. The input is labelled as a combobox and controls a listbox of real registered destinations. The implementation follows the [MDN dialog element guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) and the [WAI-ARIA APG Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). It includes an explicit close button, visible keyboard hints, an empty-result state, narrow-screen layout and reduced-motion handling.
