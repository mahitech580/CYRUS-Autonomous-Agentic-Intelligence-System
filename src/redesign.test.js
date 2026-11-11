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

test("GitHub integration is described as a source link, not an agent write connection", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('status: "Public source link"'));
  assert.ok(app.includes("Agent workflows do not write commits, branches or pull requests to GitHub."));
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


test("navigation exposes the current page and the task prompt has a programmatic label", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('aria-current={view === item.id ? "page" : undefined}'));
  assert.ok(app.includes('aria-current={view === "Settings" ? "page" : undefined}'));
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
  assert.ok(app.includes('id="workspace-sidebar" aria-label="Workspace sidebar"'));
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


test("mobile navigation traps keyboard focus and locks background scrolling", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('const previousOverflow = document.body.style.overflow;'));
  assert.ok(app.includes('document.body.style.overflow = "hidden";'));
  assert.ok(app.includes('if (event.key !== "Tab") return;'));
  assert.ok(app.includes('event.shiftKey && (document.activeElement === first || outside)'));
  assert.ok(app.includes('document.body.style.overflow = previousOverflow;'));
});


test("run drawer progress announces a human-readable completion value", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('aria-valuetext={`${progressValue}% complete`}'));
  assert.ok(app.includes('{run.agents ?? 4} agents'));
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
