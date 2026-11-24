import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WORKSPACE_ROUTES } from "../lib/routes.js";
import { filterTaskTemplates, TASK_TEMPLATES, WORKSPACE_PAGE_CONTENT } from "./page-data.js";

test("all 22 secondary general-purpose destinations have page-specific content", () => {
  const routes = WORKSPACE_ROUTES.filter((route) => route.kind !== "existing" && route.kind !== "agent");
  assert.equal(routes.length, 22);
  const titles = [];
  for (const route of routes) {
    const item = WORKSPACE_PAGE_CONTENT[route.id];
    assert.ok(item, "missing content for " + route.id);
    assert.ok(item.title && item.description && item.eyebrow && item.image);
    assert.ok(item.sections.length > 0);
    titles.push(item.title);
  }
  assert.equal(new Set(titles).size, routes.length, "secondary destinations need distinct page titles");
  assert.equal(WORKSPACE_ROUTES.filter((route) => route.kind === "agent").length, 7);
});

test("internal page cards link only to registered route ids", () => {
  const ids = new Set(WORKSPACE_ROUTES.map((route) => route.id));
  for (const [pageId,item] of Object.entries(WORKSPACE_PAGE_CONTENT)) {
    for (const section of item.sections) for (const card of section.cards) {
      assert.ok(card.title && card.description, pageId + " has an incomplete card");
      if (card.href) assert.ok(ids.has(card.href), pageId + " links to missing route " + card.href);
      if (card.external) assert.match(card.external, /^https:\/\//);
    }
  }
});

test("task library contains six distinct engineering briefs", () => {
  assert.equal(TASK_TEMPLATES.length, 6);
  assert.equal(new Set(TASK_TEMPLATES.map((item) => item.id)).size, 6);
  assert.ok(TASK_TEMPLATES.every((item) => item.goal.length > 80));
});


test("task brief filtering matches every search term and respects category filters", () => {
  assert.deepEqual(filterTaskTemplates(TASK_TEMPLATES, "security boundaries").map((item) => item.id), ["security"]);
  assert.deepEqual(filterTaskTemplates(TASK_TEMPLATES, "backfill rollback").map((item) => item.id).sort(), ["data"]);
  assert.deepEqual(filterTaskTemplates(TASK_TEMPLATES, "", "Reliability").map((item) => item.id), ["incident"]);
  assert.deepEqual(filterTaskTemplates(TASK_TEMPLATES, "no matching brief"), []);
  assert.equal(filterTaskTemplates(TASK_TEMPLATES).length, TASK_TEMPLATES.length);
});

test("previously shared route kinds now render dedicated workspace experiences", async () => {
  const source = await readFile(new URL("./WorkspacePage.jsx", import.meta.url), "utf8");
  const routes = [
    ["launchpad", "TemplateGrid"],
    ["agent", "AgentPanel"],
    ["run-list", "RunList"],
    ["prompt-library", "PromptLibraryPanel"],
    ["activity", "ActivityPanel"],
    ["observability", "ObservabilityPanel"],
    ["review-history", "ReviewHistoryPanel"],
    ["integration", "IntegrationPanel"],
    ["queue", "QueuePanel"],
    ["usage", "UsagePanel"],
    ["audit", "AuditPanel"],
    ["governance", "GovernancePanel"],
    ["policies", "PolicyPanel"],
    ["runtime", "RuntimePanel"],
    ["access", "AccessPanel"],
    ["appearance", "AppearancePanel"],
    ["deployment", "workspace-deployment-note"],
    ["ci", "CiPanel"],
  ];
  const pageBodyStart = source.indexOf("function PageBody(");
  const pageBodyEnd = source.indexOf("function PageSection(", pageBodyStart);
  const pageBody = source.slice(pageBodyStart, pageBodyEnd);
  const routeKinds = new Set(WORKSPACE_ROUTES.filter((route) => route.kind !== "existing").map((route) => route.kind));
  assert.deepEqual([...routeKinds].sort(), routes.map(([kind]) => kind).sort());
  for (const [kind, component] of routes) {
    assert.ok(pageBody.includes('if(route.kind==="' + kind + '")'), kind + " must have an explicit renderer");
    assert.ok(pageBody.includes(component), kind + " must render " + component);
  }
  assert.ok(!source.includes('route.kind==="launchpad"||route.kind==="prompt-library"'));
  assert.ok(!source.includes('["governance","policies"].includes(route.kind)'));
  assert.ok(!source.includes('["runtime","access"].includes(route.kind)'));
  assert.ok(source.includes("filterTaskTemplates(TASK_TEMPLATES,query,category)"));
  assert.ok(source.includes("runStats={runStats}"));
});


test("task brief filtering supports Unicode scripts and decomposed accents", () => {
  const templates = [
    { id: "telugu", title: "వీడియో విశ్లేషణ", category: "Research", detail: "వీడియో పరిశీలన", goal: "విశ్లేషణ" },
    { id: "arabic", title: "تحليل البيانات", category: "Research", detail: "مراجعة", goal: "تحليل" },
    { id: "latin", title: "Cafe\u0301 reliability", category: "Reliability", detail: "Service recovery", goal: "Rollback" },
  ];
  assert.deepEqual(filterTaskTemplates(templates, "వీడియో").map((item) => item.id), ["telugu"]);
  assert.deepEqual(filterTaskTemplates(templates, "تحليل").map((item) => item.id), ["arabic"]);
  assert.deepEqual(filterTaskTemplates(templates, "cafe").map((item) => item.id), ["latin"]);
  assert.deepEqual(filterTaskTemplates(templates, "తెలియని పదం"), []);
});

test("task brief filtering ignores malformed collections and records", () => {
  const templates = [null, "invalid", [], { id: "valid", title: "Secure API", category: "Backend" }];
  assert.deepEqual(filterTaskTemplates(templates, "secure").map((item) => item.id), ["valid"]);
  assert.deepEqual(filterTaskTemplates(null, "secure"), []);
  assert.deepEqual(filterTaskTemplates("invalid", "secure"), []);
});


test("task brief search preserves Indic dependent vowel signs while folding Latin accents", () => {
  const templates = [
    { id: "telugu-vowels", title: "కోడ్ విశ్లేషణ", category: "Research", detail: "భాషా పరీక్ష", goal: "తెలుగు" },
    { id: "latin-accent", title: "Cafe\u0301 reliability", category: "Reliability", detail: "Service recovery", goal: "Rollback" }
  ];
  assert.deepEqual(filterTaskTemplates(templates, "కోడ్").map((item) => item.id), ["telugu-vowels"]);
  assert.deepEqual(filterTaskTemplates(templates, "cafe").map((item) => item.id), ["latin-accent"]);
});


test("every route hero icon resolves to an imported Lucide component", async () => {
  const source = await readFile(new URL("./WorkspacePage.jsx", import.meta.url), "utf8");
  const importBlock = source.match(/import \{([\s\S]*?)\} from "lucide-react";/);
  const iconMapBlock = source.match(/const iconMap=\{([^}]+)\}/);
  assert.ok(importBlock, "WorkspacePage must import its route icons");
  assert.ok(iconMapBlock, "WorkspacePage must map route icons");
  const imported = new Set(importBlock[1].split(",").map((name) => name.trim()).filter(Boolean));
  const mapped = new Set(iconMapBlock[1].split(",").map((name) => name.trim()).filter(Boolean));
  for (const route of WORKSPACE_ROUTES) {
    assert.ok(imported.has(route.icon), route.id + " imports missing icon " + route.icon);
    assert.ok(mapped.has(route.icon), route.id + " does not map icon " + route.icon);
  }
});

test("activity stream uses retained per-run events with bounded loading and actionable filters", async () => {
  const source = await readFile(new URL("./WorkspacePage.jsx", import.meta.url), "utf8");
  const pageData = await readFile(new URL("./page-data.js", import.meta.url), "utf8");
  assert.ok(source.includes('if(route.kind==="activity")return <ActivityPanel'));
  assert.ok(source.includes("api.runs({limit:ACTIVITY_RUN_PAGE_SIZE,offset:0,signal:controller.signal})"));
  assert.ok(source.includes("api.runs({"));
  assert.ok(source.includes("snapshotAt"));
  assert.ok(source.includes("normalizeActivityRunPage"));
  assert.ok(source.includes("fetchActivityEvents"));
  assert.ok(source.includes("Promise.allSettled"));
  assert.ok(source.includes("offset+=4"));
  assert.ok(source.includes("mergeRunActivity(current,result.sources,ids,ACTIVITY_EVENT_LIMIT)"));
  assert.ok(source.includes("isRunEventPage(result.value)"));
  assert.ok(source.includes("waitingForSnapshot=canReadActivity&&workflowRuns.length>0&&!snapshotCurrent"));
  assert.ok(source.includes("getCurrentRunActivity(events,loadedRunKey,runKey,workflowRuns)"));
  assert.ok(source.includes("Load older workflows"));
  assert.ok(!source.includes(".slice(0,8)"));
  assert.ok(source.includes("filterRunEvents(currentEvents,query,statusFilter)"));
  assert.ok(source.includes('aria-label="Search retained activity"'));
  assert.ok(source.includes('aria-label="Filter activity by status"'));
  assert.ok(source.includes('onClick={()=>openRun({id:event.runId,goal:event.goal,status:event.runStatus})}'));
  assert.ok(pageData.includes("paginated set of saved workflows"));
  assert.ok(pageData.includes("load older workflow pages"));
});


test("activity pagination controls remain responsive and keyboard accessible", async () => {
  const styles = await readFile(new URL("../redesign/workspace-pages.css", import.meta.url), "utf8");
  assert.ok(styles.includes(".workspace-activity-pagination"));
  assert.ok(styles.includes(".workspace-activity-pagination button:focus-visible"));
  assert.ok(styles.includes(".workspace-activity-pagination-error"));
  assert.ok(styles.includes("@media(max-width:560px)"));
});

test("CI destination renders live, read-only GitHub Actions run evidence", async () => {
  const source = await readFile(new URL("./WorkspacePage.jsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("../lib/github-actions.js", import.meta.url), "utf8");
  assert.ok(source.includes('if(route.kind==="ci")return <CiPanel/>'));
  assert.ok(source.includes("GITHUB_ACTIONS_API"));
  assert.ok(source.includes("normalizeWorkflowRuns(await response.json())"));
  assert.ok(source.includes("signal:controller.signal"));
  assert.ok(source.includes('aria-label="Search workflow runs"'));
  assert.ok(source.includes('aria-label="Filter workflow runs by status"'));
  assert.ok(source.includes("getWorkflowRunsErrorMessage(response.status,response.headers)"));
  assert.ok(helper.includes("code === 429"));
  assert.ok(helper.includes('remaining === "0"'));
  assert.ok(helper.includes('headers?.get?.("retry-after")'));
  assert.ok(helper.includes("actions/runs/"));
  assert.ok(!source.includes("workspace-ci-step-state"), "configured checks must not be presented as live pass/fail results");
});

test("live CI layout exposes responsive controls and visible keyboard focus", async () => {
  const styles = await readFile(new URL("../redesign/workspace-pages.css", import.meta.url), "utf8");
  assert.ok(styles.includes(".workspace-ci-summary"));
  assert.ok(styles.includes(".workspace-ci-toolbar"));
  assert.ok(styles.includes(".workspace-ci-run a:focus-visible"));
  assert.ok(styles.includes("@media(max-width:740px)"));
  assert.ok(styles.includes("@media(max-width:420px)"));
});


test("review history is a dedicated paginated API-backed decision workspace", async () => {
  const source = await readFile(new URL("./WorkspacePage.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('if(route.kind==="review-history")return <ReviewHistoryPanel'));
  assert.ok(source.includes("REVIEW_HISTORY_STATUSES.map((status)=>api.runs"));
  assert.ok(source.includes("Promise.allSettled"));
  assert.ok(source.includes("normalizeReviewHistoryPage(result.value,status,0,REVIEW_HISTORY_PAGE_SIZE)"));
  assert.ok(source.includes("snapshotAt:snapshots[status]"));
  assert.ok(source.includes("mergeReviewHistoryRefresh(current,incoming,successfulStatuses)"));
  assert.ok(source.includes("staleStatuses.includes(\"approved\")"));
  assert.ok(source.includes("staleStatuses.includes(\"rejected\")"));
  assert.ok(source.includes("getRunPageOffset(result.value"));
  assert.ok(source.includes("filterReviewHistory(records,query,decisionFilter)"));
  assert.ok(source.includes("Load older decisions"));
  assert.ok(source.includes("openRun(run)"));
  assert.ok(source.includes("refreshToken"));
  assert.ok(source.includes("onUnauthorized"));
  assert.ok(app.includes("refreshToken={reviewRefreshToken}"));
  assert.ok(app.includes("onUnauthorized={redirectToSettingsOnUnauthorized}"));
});
