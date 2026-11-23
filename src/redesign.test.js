import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");
const modulesFrom = (entry) => entry.split("\n")
  .filter((line) => line.startsWith('@import "./redesign/'))
  .map((line) => line.slice('@import "./redesign/'.length, -2));

test("every imported visual module exists and is loaded once", async () => {
  const modules = modulesFrom(await read("redesign.css"));
  assert.ok(modules.length >= 30, "the design system should stay modular");
  assert.equal(new Set(modules).size, modules.length, "a module must not be imported twice");
  await Promise.all(modules.map(async (module) => {
    const info = await stat(join(root, "redesign", module));
    assert.ok(info.isFile(), `missing design module: ${module}`);
  }));
});

test("design tokens use the midnight spectrum palette", async () => {
  const tokens = await read("redesign/tokens.css");
  for (const token of ["#070b18", "#0d1528", "#67e8f9", "#7da5ff", "#b69cff"]) {
    assert.ok(tokens.includes(token), `missing design token ${token}`);
  }
  assert.ok(tokens.includes("color-scheme: dark"));
});

test("responsive and motion preferences remain in the visual system", async () => {
  const imported = modulesFrom(await read("redesign.css"));
  const styles = (await Promise.all(imported.map((file) => readFile(join(root, "redesign", file), "utf8")))).join("\n");
  for (const rule of ["max-width: 640px", "max-width: 900px", "prefers-reduced-motion: reduce", "prefers-contrast: more"]) {
    assert.ok(styles.includes(rule), `missing accessibility or responsive rule: ${rule}`);
  }
});

test("overview activity visuals do not invent minimum progress for zero-percent runs", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("style={{ height: value + \"%\" }}"));
  assert.ok(app.includes('label="ACTIVE / QUEUED"'));
  assert.ok(app.includes("Queued or running workflows"));
  assert.ok(!app.includes("Math.max(5, value)"));
});

test("rejected workflow decisions remain visible in run and review history", async () => {
  const app = await read("../src/App.jsx");
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const backend = await read("../backend/main.py");
  assert.ok(app.includes('<option value="rejected">Rejected</option>'));
  assert.ok(app.includes('rejected: "Rejected"'));
  assert.ok(pages.includes('rejected:"Rejected"'));
  assert.ok(pages.includes('["completed","approved","rejected","failed","cancelled"]'));
  assert.ok(pages.includes('if(route.kind==="review-history")return <ReviewHistoryPanel'));
  assert.ok(pages.includes('const REVIEW_HISTORY_STATUSES=["approved","rejected"]'));
  assert.ok(pages.includes("getReviewDecision(run)"));
  assert.ok(pages.includes("filterReviewHistory(records,query,decisionFilter)"));
  assert.ok(backend.includes('pattern="^(queued|running|review|approved|rejected|completed|failed|cancelled)$"'));
});


test("GitHub source links and runtime integrations are not mislabeled as connected services", async () => {
  const app = await read("../src/App.jsx");
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(app.includes('status: "Public source link"'));
  assert.ok(app.includes("Agent workflows do not write commits, branches or pull requests to GitHub."));
  assert.ok(pages.includes('github:{value:"Public source link only",ok:false'));
  assert.ok(pages.includes('route.integration==="github"?"SOURCE REFERENCE"'));
  assert.ok(pages.includes("No GitHub API or app connection is configured"));
  assert.ok(pages.includes('value:!snapshotAvailable?"Runtime status unavailable"'));
});

test("mobile photographic backdrop scrolls with the page and fonts use swap", async () => {
  const html = await read("../index.html");
  const backdrop = await read("redesign/environment-backdrop.css");
  assert.ok(html.includes("fonts.googleapis.com/css2"));
  assert.ok(html.includes("&display=swap"));
  assert.ok(backdrop.includes("@media (max-width: 900px)"));
  assert.ok(backdrop.includes("background-attachment:scroll"));
});

test("photographic references stay on Unsplash and carry accessible context", async () => {
  const app = await read("../src/App.jsx");
  const imageCount = app.split("https://images.unsplash.com/").length - 1;
  assert.ok(imageCount >= 4, "hero and task-brief photography should remain present");
  assert.ok(app.includes('alt="Rows of illuminated server racks'));
  assert.ok(app.includes('loading="lazy"'));
  assert.ok(app.includes("https://unsplash.com/license"));
});


test("deployment cards do not imply an unverified Vercel deployment is live", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('state: "Configured URL · latest deploy unverified"'));
  assert.ok(app.includes('state: "Workflow history link"'));
  assert.ok(app.includes("verify the latest deployment"));
  assert.ok(!app.includes('state: "Deployed alias"'));
});


test("navigation exposes all route groups and current page with native anchors", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/workspace-pages.css");
  assert.ok(app.includes("WORKSPACE_NAV_GROUPS.map"));
  assert.ok(app.includes('aria-label="Workspace pages"'));
  assert.ok(app.includes('aria-current={currentRoute.id === item.id ? "page" : undefined}'));
  assert.ok(app.includes('href={getWorkspaceHref(item.id)}'));
  assert.ok(styles.includes(".workspace-navigation"));
  assert.ok(styles.includes("overflow-y:auto"));
  assert.ok(app.includes('id="task-prompt-label"'));
  assert.ok(app.includes('aria-labelledby="task-prompt-label"'));
});


test("review queue uses the complete server-side pending-review filter and pagination", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('status: "review", signal: controller.signal'));
  assert.ok(app.includes("pendingTotal"));
  assert.ok(app.includes("Load more pending reviews"));
  assert.ok(app.includes("The count and pages below come from every saved run in the backend"));
  assert.ok(app.includes("setReviewRefreshToken((current) => current + 1)"));
});

test("deployment readiness includes database reachability and durable worker capacity", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('const databaseReachable = !!workspaceConfig?.database_reachable;'));
  assert.ok(app.includes('const workerReady = !!workspaceConfig && (!workspaceConfig.worker_required || !!workspaceConfig.worker_ready);'));
  assert.ok(app.includes('title: "Database connectivity"'));
  assert.ok(app.includes('title: "Execution worker"'));
});


test("overview readiness separates database reachability from durable storage", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/readiness.css");
  assert.ok(app.includes('label="Database connectivity"'));
  assert.ok(app.includes('workspaceConfig?.database_reachable'));
  assert.ok(app.includes('/ 6 checks'));
  assert.ok(app.includes("Restore database connectivity"));
  assert.ok(app.includes("Start the supervised CYRUS worker"));
  assert.ok(styles.includes("grid-template-columns:repeat(3,minmax(0,1fr))"));
});

test("mobile navigation is hidden from keyboard users until opened and restores focus", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("styles.css");
  assert.ok(app.includes('id="workspace-sidebar" role={mobileViewport && mobileNav ? "dialog" : undefined} aria-modal={mobileViewport && mobileNav ? "true" : undefined} aria-label="Workspace navigation"'));
  assert.ok(app.includes('sidebar?.toggleAttribute("inert", sidebarInert);'));
  assert.ok(app.includes('aria-expanded={mobileNav} aria-controls="workspace-sidebar"'));
  assert.ok(app.includes('if (event.key === "Escape")'));
  assert.ok(app.includes('document.querySelector(".open-mobile")?.focus()'));
  assert.ok(styles.includes("visibility: hidden; transition: transform .2s ease, visibility 0s linear .2s"));
});


test("run list progress indicators expose bounded accessible values", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('role="progressbar" aria-label={`Workflow ${run.id} progress`}'));
  assert.ok(app.includes('const progress = Math.max(0, Math.min(100, Number(run.progress) || 0));'));
  assert.ok(app.includes('aria-valuenow={progress}'));
});


test("mobile navigation focus trap includes disclosure summaries and excludes collapsed links", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('summary:not([tabindex="-1"]), button:not([disabled])'));
  assert.ok(app.includes('!element.closest("[hidden], [inert]")'));
  assert.ok(app.includes('!element.closest("details:not([open])") || element.matches("summary")'));
});


test("mobile navigation traps keyboard focus and locks background scrolling", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('const previousOverflow = document.body.style.overflow;'));
  assert.ok(app.includes('document.body.style.overflow = "hidden";'));
  assert.ok(app.includes('if (event.key !== "Tab") return;'));
  assert.ok(app.includes('event.shiftKey && (document.activeElement === first || outside)'));
  assert.ok(app.includes('document.body.style.overflow = previousOverflow;'));
});


test("run rows show persisted stage counts instead of inferred per-run agent usage", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('aria-valuetext={`${progressValue}% complete`}'));
  assert.ok(app.includes("getRunRecordCount(run.stage_count)"));
  assert.ok(app.includes("Stages unavailable"));
  assert.ok(app.includes('run.time || "Time unavailable"'));
  assert.ok(!app.includes("{run.agents ?? 4} agents"));
});

test("review history labels only validated persisted stage and event counts", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(pages.includes("getRunRecordCount(run.stage_count)"));
  assert.ok(pages.includes("getRunRecordCount(run.event_count)"));
  assert.ok(pages.includes("Stages unavailable"));
  assert.ok(pages.includes("Events unavailable"));
});


test("run drawer aggregates token usage as non-negative numeric counts", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("const inputTokens = Number(stage?.usage?.input_tokens);"));
  assert.ok(app.includes("const outputTokens = Number(stage?.usage?.output_tokens);"));
  assert.ok(app.includes("Math.max(0, Math.floor(inputTokens))"));
  assert.ok(app.includes("Math.max(0, Math.floor(outputTokens))"));
});

test("settings reports when browser session storage cannot save the access key", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("function saveWorkspaceAccessKey()"));
  assert.ok(app.includes("if (!setAccessKey(accessKey))"));
  assert.ok(app.includes('role="alert">{accessKeyError}'));
  assert.ok(app.includes("Allow session storage, then try again."));
});

test("agent fleet reads backend missions and exposes real capabilities without fake configuration actions", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/agent-cards.css");
  assert.ok(app.includes("api.agents()"));
  assert.ok(app.includes('className="agent-detail"'));
  assert.ok(app.includes("agent.capabilities"));
  assert.ok(app.includes("7 fixed pipeline roles"));
  assert.ok(!app.includes("Configure agent"));
  assert.ok(styles.includes(".agent-detail summary:focus-visible"));
});

test("overview empty-state actions use registered starter briefs", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("function loadStarter(brief)"));
  assert.ok(app.includes("loadStarter(starterBriefs[0])"));
  assert.ok(app.includes("loadStarter(starterBriefs[1])"));
  assert.ok(!app.includes("starterTasks["));
});

test("run drawer selects the latest saved stage after asynchronous detail loading", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("const initialStageSelection = useRef(stages.length > 0);"));
  assert.ok(app.includes("if (!initialStageSelection.current && stages.length > 0)"));
  assert.ok(app.includes("setExpandedStage(stages[stages.length - 1]?.id || \"plan\")"));
});

test("unauthorized workspace responses return the operator to settings", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("function redirectToSettingsOnUnauthorized(error)"));
  assert.ok(app.includes("if (error?.status !== 401) return false;"));
  assert.ok(app.includes("setSelectedRun(null);"));
  assert.ok(app.includes("setView(\"Settings\");"));
  assert.ok(app.includes("Workspace access key is missing or incorrect. Update it in Settings."));
});

test("run event history announces only the latest event to assistive technology", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/focus-accessibility.css");
  assert.ok(app.includes('className="sr-only" role="status" aria-live="polite" aria-atomic="true"'));
  assert.ok(app.includes('role="region" aria-label="Execution event history"'));
  assert.ok(!app.includes('className="drawer-event-list" role="region" aria-live='));
  assert.ok(styles.includes(".sr-only {"));
});


test("keyboard users can skip workspace navigation and focus the main content", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/focus-accessibility.css");
  assert.ok(app.includes('className="skip-link" href="#main-content"'));
  assert.ok(app.includes('className="page-content" id="main-content" tabIndex={-1}'));
  assert.ok(styles.includes(".skip-link:focus"));
  assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"));
});


test("workflow history refresh and pagination requests cannot overlap", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("if (refreshingRuns || loadingMoreRuns) return;"));
  assert.ok(app.includes("if (loadingMoreRuns || refreshingRuns || runsOffset >= runsTotal) return;"));
  assert.ok(app.includes("disabled={loadingMoreRuns || refreshingRuns}"));
  assert.ok(app.includes("disabled={refreshingRuns || loadingMoreRuns}"));
});

test("pending review refresh waits for an in-flight older-page request", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("if (pendingLoading || loadingMorePending || pendingOffset >= pendingTotal) return;"));
  assert.ok(app.includes("disabled={pendingLoading || loadingMorePending}"));
});


test("workspace subpages expose a primary heading without changing panel heading hierarchy", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("styles.css");
  assert.ok(app.includes("<h1>{title}</h1>"));
  assert.ok(styles.includes(".section-title :is(h1,h2)"));
  assert.ok(styles.includes(".panel-heading h2"));
});


test("frontend package, workspace chrome and API share one release version", async () => {
  const metadata = JSON.parse(await read("../package.json"));
  const backend = await read("../backend/main.py");
  const app = await read("../src/App.jsx");
  assert.equal(metadata.version, "0.2.3");
  assert.ok(backend.includes('APP_VERSION = "0.2.3"'));
  assert.ok(app.includes("CYRUS Workspace <b>0.2.3</b>"));
  assert.ok(app.includes("CYRUS · 0.2.3"));
});


test("a failed older-review page keeps the already loaded approval queue visible", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes("const [pendingMoreError, setPendingMoreError] = useState(\"\");"));
  assert.ok(app.includes("else setPendingMoreError(error?.message || \"Could not load older pending reviews.\");"));
  assert.ok(app.includes("pendingMoreError ? \"Retry loading older reviews\" : \"Load more pending reviews\""));
  assert.ok(app.includes('<span className="inline-help" role="alert">{pendingMoreError}</span>'));
});


test("overview metrics use API-wide aggregates instead of only the first history page", async () => {
  const app = await read("../src/App.jsx");
  const backend = await read("../backend/main.py");
  assert.ok(app.includes("runStats={runStats}"));
  assert.ok(app.includes("const totalWorkflows = Number.isFinite(Number(runStats?.total))"));
  assert.ok(app.includes("const averageCompletion = runStats?.average_progress"));
  assert.ok(backend.includes('"stats": stats'));
  assert.ok(backend.includes('"average_progress": round(float(aggregate[3] or 0), 1)'));
});


test("run timeline displays measured stage durations from persisted events", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/timeline.css");
  assert.ok(app.includes("getRunStageTiming(run, stageId)"));
  assert.ok(app.includes("formatDurationMs(timing.durationMs)"));
  assert.ok(app.includes('timeline-duration-" + timing.status'));
  assert.ok(styles.includes(".timeline-duration-running"));
  assert.ok(styles.includes(".timeline-duration-failed"));
});


test("review pagination aborts stale pages when the queue refreshes or unmounts", async () => {
  const app = await read("../src/App.jsx");
  const review = app.slice(app.indexOf("function ReviewView("), app.indexOf("function DeploymentsView("));
  assert.ok(review.includes("const pendingPageController = useRef(null);"));
  assert.ok(review.includes("pendingPageController.current?.abort();"));
  assert.ok(review.includes("signal: controller.signal"));
  assert.ok(review.includes('if (error?.name === "AbortError") return;'));
  assert.ok(review.includes("pendingPageController.current === controller"));
});


test("mobile navigation and run details keep background surfaces inert", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('role={mobileViewport && mobileNav ? "dialog" : undefined}'));
  assert.ok(app.includes('aria-modal={mobileViewport && mobileNav ? "true" : undefined}'));
  assert.ok(app.includes('sidebar?.toggleAttribute("inert", sidebarInert);'));
  assert.ok(app.includes('main?.toggleAttribute("inert", mainInert);'));
  assert.ok(app.includes("const drawerOpen = !!selectedRun?.id;"));
  assert.ok(app.includes("}, [mobileViewport, mobileNav, selectedRun?.id]);"));
  assert.ok(app.includes("window.requestAnimationFrame(() => {"));
});


test("overview fleet status displays only API-backed queue pressure", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/operations.css");
  assert.ok(app.includes('const queueSnapshotAvailable = apiState === "connected"'));
  assert.ok(app.includes('aria-label="Persisted workflow queue snapshot"'));
  assert.ok(app.includes("{workspaceConfig.queued_workflows}"));
  assert.ok(app.includes("{workspaceConfig.running_workflows}"));
  assert.ok(app.includes('{workspaceConfig.orphaned_workflows ?? "—"}'));
  assert.ok(styles.includes(".fleet-queue-strip"));
});


test("run details disclose when the API event history reaches its retention limit", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/events.css");
  assert.ok(app.includes("const eventsAtRetentionLimit = events.length >= 250;"));
  assert.ok(app.includes('eventsAtRetentionLimit ? "Latest 250 retained"'));
  assert.ok(app.includes("Older event records are not available."));
  assert.ok(styles.includes(".drawer-event-retention"));
});


test("operational subpages use distinct icon-led, image-backed page headings", async () => {
  const app = await read("../src/App.jsx");
  const pageStyles = await read("redesign/page-headers.css");
  const visualReferences = await read("../docs/visual-system-and-image-references.md");
  for (const icon of ["icon={Bot}", "icon={Workflow}", "icon={GitPullRequest}", "icon={Rocket}", "icon={Boxes}", "icon={Settings2}"]) {
    assert.ok(app.includes(icon), `missing page heading icon: ${icon}`);
  }
  assert.ok(app.includes('className="page-heading-visual" aria-hidden="true"><img'));
  assert.ok(app.includes('alt="" loading="eager" fetchPriority="high" decoding="async"'));
  assert.ok(app.includes('src={brief.image} alt="" loading="lazy" decoding="async"'));
  assert.ok(pageStyles.includes("@media (max-width: 740px)"));
  assert.ok(visualReferences.includes("https://unsplash.com/license"));
});


test("activity stream and observability expose separate saved-record and telemetry views", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const data = await read("../src/workspace/page-data.js");
  assert.ok(pages.includes('const isAll=route.filter==="all"'));
  assert.ok(pages.includes('isAll?runs:'));
  assert.ok(pages.includes('if(route.kind==="activity")return <ActivityPanel'));
  assert.ok(pages.includes("api.runEvents(run.id,null,{signal:controller.signal})"));
  assert.ok(pages.includes("mergeRunActivity(events,sources,recentRuns.map((run)=>run.id),50)"));
  assert.ok(pages.includes("getCurrentRunActivity(events,loadedRunKey,runKey,recentRuns)"));
  assert.ok(pages.includes('if(route.kind==="observability")return <ObservabilityPanel'));
  assert.ok(pages.includes('isAll?"Latest saved workflow records"'));
  assert.ok(data.includes("approved or rejected workflow decision"));
  assert.ok(data.includes("persisted stage events across up to eight of the latest loaded workflows"));
});


test("usage view can load run details before summarizing real provider token metadata", async () => {
  const app = await read("../src/App.jsx");
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const runs = await read("../src/lib/runs.js");
  assert.ok(app.includes('setRuns((current) => current.map((item) => item.id === run.id ? { ...item, ...detail } : item))'));
  assert.ok(pages.includes("summarizeRunUsage(runs)"));
  assert.ok(pages.includes("onClick={()=>openRun(run)}"));
  assert.ok(runs.includes("export function summarizeRunUsage(runs)"));
});


test("runtime and queue pages do not display stale configuration as current readiness", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(pages.includes('!snapshotAvailable?"Unknown"'));
  assert.ok(pages.includes('workerStatus=config?.runtime_configuration_missing?"Server access control not configured"'));
  assert.ok(pages.includes('const workerReady=snapshotAvailable&&!!config.worker_ready'));
  assert.ok(pages.includes("Runtime checks are unknown until a fresh API snapshot is available."));
});


test("settings does not infer zero worker capacity or disabled research from protected runtime metadata", async () => {
  const app = await read("../src/App.jsx");
  const start = app.indexOf("function SettingsView");
  const end = app.indexOf("function formatEventTime", start);
  const settings = app.slice(start, end);
  assert.ok(settings.includes("runtimeConfigRestricted"));
  assert.ok(settings.includes("Worker ready · capacity unknown"));
  assert.ok(settings.includes('workspaceConfig?.web_search_enabled == null ? "Unknown"'));
  assert.ok(settings.includes('runtimeConfigRestricted ? "Access required"'));
  assert.ok(settings.includes('apiState === "connected" && !runtimeConfigRestricted'));
  assert.ok(!settings.includes("workspaceConfig?.available_workers ?? 0"));
});


test("queue page can refresh protected runtime telemetry and explains unavailable snapshots", async () => {
  const app = await read("../src/App.jsx");
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(app.includes("async function refreshWorkspaceRuntime()"));
  assert.ok(app.includes("onRefreshRuntime={refreshWorkspaceRuntime}"));
  assert.ok(pages.includes('function QueuePanel({config,apiState,onRefreshRuntime})'));
  assert.ok(pages.includes("onClick={refresh}"));
  assert.ok(pages.includes('config?.runtime_access_denied?"Workspace access required"'));
  assert.ok(pages.includes('config?.runtime_configuration_missing?"Server access control not configured"'));
  assert.ok(pages.includes("CYRUS_ACCESS_KEY must be configured in the server environment"));
  assert.ok(pages.includes('config?.runtime_access_denied?"Workspace access required"'));
  assert.ok(pages.includes("Queue and worker counts are from the latest runtime snapshot."));
  assert.ok(pages.includes('role="alert"'));
  const settingsStart = app.indexOf("function SettingsView");
  const settingsEnd = app.indexOf("function formatEventTime", settingsStart);
  assert.ok(!app.slice(settingsStart, settingsEnd).includes('setApiState("unavailable")'));
  const styles = await read("redesign/workspace-pages.css");
  assert.ok(styles.includes(".workspace-queue-toolbar"));
});


test("CI page reads live public Actions results without implying unverified checks passed", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const helper = await read("../src/lib/github-actions.js");
  const styles = await read("redesign/workspace-pages.css");
  const start = pages.indexOf("function CiPanel()");
  const end = pages.indexOf("function PageBody(", start);
  const ci = pages.slice(start, end);
  assert.ok(ci.includes("GITHUB_ACTIONS_API"));
  assert.ok(ci.includes("normalizeWorkflowRuns(await response.json())"));
  assert.ok(ci.includes("cache:\"no-store\""));
  assert.ok(ci.includes("workflowStatusLabels"));
  assert.ok(ci.includes("formatWorkflowDuration(run.elapsedSeconds)"));
  assert.ok(ci.includes("No token, rerun, cancel or repository-write permission is used."));
  assert.ok(helper.includes("safeRunUrl"));
  assert.ok(styles.includes(".workspace-ci-run"));
  assert.ok(styles.includes(".workspace-ci-state"));
  assert.ok(styles.includes(".workspace-ci-duration"));
});


test("secondary workspace pages use unfiltered loaded records, not run-list search results", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('<WorkspacePage route={currentRoute} runs={runs} runsTotal={runsTotal}'));
  assert.ok(!app.includes('<WorkspacePage route={currentRoute} runs={visibleRuns}'));
});


test("workflow audit uses persisted run summaries and opens full run evidence", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const data = await read("../src/workspace/page-data.js");
  const styles = await read("redesign/workspace-pages.css");
  assert.ok(pages.includes("function AuditPanel({runs,openRun})"));
  assert.ok(pages.includes("run.event_count"));
  assert.ok(pages.includes("run.approval_status"));
  assert.ok(pages.includes('if(route.kind==="audit")return <AuditPanel'));
  assert.ok(pages.includes('onClick={()=>onOpen(run)}'));
  assert.ok(data.includes("retained event counts"));
  assert.ok(styles.includes(".workspace-audit-record:focus-visible"));
});


test("secondary workspace pages use a route-aware shared renderer", async () => {
  const app = await read("../src/App.jsx");
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const styles = await read("redesign/workspace-pages.css");
  assert.ok(app.includes('<WorkspacePage route={currentRoute}'));
  assert.ok(pages.includes("WORKSPACE_PAGE_CONTENT[route.id]"));
  assert.ok(pages.includes('alt="" loading="eager" fetchPriority="high" decoding="async"'));
  assert.ok(pages.includes("AgentPanel"));
  assert.ok(pages.includes("RunList"));
  assert.ok(styles.includes("@media(max-width:740px)"));
  assert.ok(styles.includes("@media(prefers-reduced-motion:reduce)"));
});

test("workspace cards use registered hash routes and safe external resource links", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(pages.includes('getWorkspaceHref(item.href||"overview")'));
  assert.ok(pages.includes('target={external?"_blank":undefined}'));
  assert.ok(pages.includes('rel={external?"noreferrer":undefined}'));
  assert.ok(pages.includes("onSelectTemplate(item)"));
});

test("secondary operations views preserve honest runtime and safety boundaries", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  assert.ok(pages.includes("snapshotAvailable&&config.queued_workflows!=null&&config.running_workflows!=null"));
  assert.ok(pages.includes("snapshotAvailable&&!!config.worker_ready"));
  assert.ok(pages.includes('workerStatus=config?.runtime_configuration_missing?"Server access control not configured"'));
  assert.ok(pages.includes("Cost is not estimated"));
  assert.ok(pages.includes("agent workflows do not write commits, branches or pull requests"));
  assert.ok(pages.includes("Generated code is not executed"));
  assert.ok(pages.includes("Approval does not deploy"));
});

test("workspace command palette is available from the keyboard and top bar", async () => {
  const app = await read("../src/App.jsx");
  const menu = await read("WorkspaceCommandMenu.jsx");
  const styles = await read("redesign/command-menu.css");
  const imports = await read("redesign.css");
  assert.ok(app.includes('aria-keyshortcuts="Control+K Meta+K"'));
  assert.ok(app.includes("shouldOpenWorkspaceCommand(event)"));
  const navigation = await read("lib/navigation.js");
  const navigationTests = await read("lib/navigation.test.js");
  assert.ok(navigation.includes("target?.isContentEditable"));
  assert.ok(navigation.includes('["input", "textarea", "select"]'));
  assert.ok(navigationTests.includes("does not steal keystrokes from editable controls"));
  assert.ok(app.includes("<WorkspaceCommandMenu open={commandOpen}"));
  assert.ok(menu.includes("dialog.showModal()"));
  assert.ok(menu.includes('role="combobox"'));
  assert.ok(menu.includes('role="listbox"'));
  assert.ok(menu.includes('role="option"'));
  assert.ok(menu.includes('event.key === "ArrowDown"'));
  assert.ok(menu.includes('event.key === "ArrowUp"'));
  assert.ok(menu.includes('event.key === "Enter"'));
  assert.ok(menu.includes("onCancel="));
  assert.ok(menu.includes("WORKSPACE_ROUTES.length"));
  assert.ok(menu.includes('aria-live="polite"'));
  assert.ok(styles.includes("::backdrop"));
  assert.ok(styles.includes(":focus-visible"));
  assert.ok(styles.includes("@media (max-width: 640px)"));
  assert.ok(styles.includes("prefers-reduced-motion: reduce"));
  assert.ok(imports.includes('@import "./redesign/command-menu.css";'));
});



test("command palette keeps listbox focus on its combobox instead of tabbable action buttons", async () => {
  const menu = await read("WorkspaceCommandMenu.jsx");
  assert.ok(menu.includes('role="combobox"'));
  assert.ok(menu.includes('role="listbox"'));
  assert.ok(menu.includes('role="option"'));
  assert.ok(menu.includes("tabIndex={-1}"));
  assert.ok(menu.includes("onMouseDown={(event) => event.preventDefault()}"));
  assert.ok(!menu.includes('<button\n            id={"cyrus-command-option-" + route.id}'));
});

test("queue refresh announces successful snapshots to assistive technology", async () => {
  const pages = await read("../src/workspace/WorkspacePage.jsx");
  const styles = await read("redesign/workspace-pages.css");
  assert.ok(pages.includes('role="status" aria-live="polite"'));
  assert.ok(pages.includes('setRefreshMessage("Queue snapshot refreshed.")'));
  assert.ok(pages.includes('setRefreshMessage("")'));
  assert.ok(styles.includes(".workspace-sr-only"));
  assert.ok(styles.includes("clip:rect(0,0,0,0)"));
});


test("secondary workspace explanatory copy meets a legible minimum size", async () => {
  const styles = await read("redesign/readability.css");
  const imports = await read("redesign.css");
  assert.ok(imports.includes('@import "./redesign/readability.css";'));
  for (const selector of [
    ".workspace-page-primary-heading p",
    ".workspace-page-section-heading p",
    ".workspace-destination-copy strong",
    ".workspace-destination-copy small",
    ".workspace-page-rail-card > p",
    ".workspace-template-card p",
    ".workspace-run-record-main small"
  ]) {
    assert.ok(styles.includes(selector), "missing readable type scale for " + selector);
  }
  assert.ok(styles.includes("font-size: 12px"));
  assert.ok(styles.includes("font-size: 11px"));
  assert.ok(styles.includes("@media(max-width:740px)"));
});


test("queue telemetry labels the protected server snapshot with its capture time", async () => {
  const backend = await read("../backend/main.py");
  const pages = await read("workspace/WorkspacePage.jsx");
  const styles = await read("redesign/workspace-pages.css");
  const configStart = backend.indexOf('def config()');
  const configEnd = backend.indexOf('@app.get("/api/health")', configStart);
  assert.ok(backend.slice(configStart, configEnd).includes('"snapshot_at": utcnow().isoformat()'));
  assert.ok(pages.includes("config.snapshot_at"));
  assert.ok(pages.includes('className="workspace-queue-snapshot-time"'));
  assert.ok(pages.includes('dateTime={captured.toISOString()}'));
  assert.ok(styles.includes(".workspace-queue-snapshot-time"));
});


test("run timeline stage disclosures expose expanded state and stable panel relationships", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('aria-expanded={!!stage && expandedStage === stageId}'));
  assert.ok(app.includes('aria-controls={stage ? "artifact-panel-" + run.id + "-" + stageId : undefined}'));
  assert.ok(app.includes('className="artifact-output" hidden={expandedStage !== stageId}'));
  assert.ok(app.includes('type="button" className="timeline-stage-button"'));
});

test("legacy stylesheet fallback accents stay in the cyan and mint palette", async () => {
  const styles = await read("styles.css");
  const tokens = await read("redesign/tokens.css");
  assert.ok(tokens.includes("--lime: #67e8f9"));
  for (const legacy of ["#c7fb63", "#c9fa78", "#d9ff91", "#e0ff9b", "#e3ffad", "#e0ffb7", "rgba(199,251,99", "rgba(201,250,120"]) {
    assert.ok(!styles.includes(legacy), `legacy accent remains in base styles: ${legacy}`);
  }
  assert.ok(styles.includes("background: #72f1c4"));
});

test("Vercel applies browser security headers to every workspace response", async () => {
  const config = JSON.parse(await read("../vercel.json"));
  const rule = config.headers?.find((item) => item.source === "/(.*)");
  assert.ok(rule, "security headers should cover all application routes");
  const headers = Object.fromEntries((rule.headers || []).map(({ key, value }) => [key, value]));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["Permissions-Policy"], "camera=(), microphone=(), geolocation=()");
});



test("settings exposes the server-enforced workspace launch quota", async () => {
  const app = await read("../src/App.jsx");
  const backend = await read("../backend/main.py");
  assert.ok(backend.includes('"run_launch_limits"'));
  assert.ok(app.includes('RUN LAUNCH LIMITS'));
  assert.ok(app.includes('launchLimits?.per_minute'));
  assert.ok(app.includes('launchLimits?.per_hour'));
  assert.ok(app.includes('launchLimits?.enabled === false'));
});


test("run event history provides accessible search and API-derived status filters", async () => {
  const app = await read("../src/App.jsx");
  const styles = await read("redesign/events.css");
  const helpers = await read("../src/lib/runs.js");
  assert.ok(app.includes('type="search"'));
  assert.ok(app.includes('aria-label="Search execution events"'));
  assert.ok(app.includes('aria-label="Filter events by status"'));
  assert.ok(app.includes("getRunEventStatuses(events)"));
  assert.ok(app.includes("filterRunEvents(events, eventQuery, eventStatusFilter)"));
  assert.ok(app.includes("filteredEvents.slice().reverse().map"));
  assert.ok(app.includes("No matching execution events"));
  assert.ok(app.includes('role="status" aria-live="polite" aria-atomic="true"'));
  assert.ok(helpers.includes('export function filterRunEvents(events, query = "", statusFilter = "all")'));
  assert.ok(styles.includes(".drawer-event-toolbar"));
  assert.ok(styles.includes(".drawer-event-empty"));
  assert.ok(styles.includes("@media(max-width:560px)"));
});

test("run event filters reset when the drawer switches runs and do not narrow report exports", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('}, [run.id]);'));
  assert.ok(app.includes('setEventQuery("");'));
  assert.ok(app.includes('setEventStatusFilter("all");'));
  assert.ok(app.includes('...(run.events || []).map((event) =>'));
  assert.ok(app.includes("filteredEvents.slice().reverse().map"));
  assert.ok(app.includes("const eventsAtRetentionLimit = events.length >= 250;"));
});


test("execution event filters retain visible keyboard focus indicators", async () => {
  const styles = await read("redesign/events.css");
  assert.ok(styles.includes(".drawer-event-search:focus-within"));
  assert.ok(styles.includes(".drawer-event-filter:focus-within"));
  assert.ok(styles.includes(".drawer-event-clear:focus-visible"));
  assert.ok(styles.includes("outline-offset:3px"));
  assert.ok(styles.includes("rgba(103,232,249,.13)"));
});


test("activity stream typography is readable and long messages stay bounded on mobile", async () => {
  const styles = await read("redesign/workspace-pages.css");
  const start = styles.indexOf(".workspace-activity-panel");
  const mobileStart = styles.indexOf("@media(max-width:740px)", start);
  assert.ok(start >= 0 && mobileStart > start, "activity styles and mobile layout must exist");
  const desktop = styles.slice(start, mobileStart);
  assert.ok(desktop.includes("font-size:12px"), "event messages need readable 12px text");
  assert.ok(desktop.includes("font-size:10px"), "activity metadata needs readable 10px text");
  assert.ok(desktop.includes("-webkit-line-clamp:2"), "long event messages must not dominate the activity list");
  const mobileEnd = styles.indexOf("@media(max-width:360px)", mobileStart);
  const mobile = styles.slice(mobileStart, mobileEnd < 0 ? undefined : mobileEnd);
  assert.ok(mobile.includes(".workspace-activity-filter{grid-column:1/-1}"), "mobile status filter must use the full toolbar width");
});
