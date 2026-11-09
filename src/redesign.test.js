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


test("deployment readiness includes database reachability and durable worker capacity", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('const databaseReachable = !!workspaceConfig?.database_reachable;'));
  assert.ok(app.includes('const workerReady = !!workspaceConfig && (!workspaceConfig.worker_required || !!workspaceConfig.worker_ready);'));
  assert.ok(app.includes('title: "Database connectivity"'));
  assert.ok(app.includes('title: "Execution worker"'));
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
