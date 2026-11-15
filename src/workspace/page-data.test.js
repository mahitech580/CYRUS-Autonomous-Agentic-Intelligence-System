import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WORKSPACE_ROUTES } from "../lib/routes.js";
import { filterTaskTemplates, TASK_TEMPLATES, WORKSPACE_PAGE_CONTENT } from "./page-data.js";

test("all 22 secondary general-purpose destinations have page-specific content", () => {
  const routes = WORKSPACE_ROUTES.filter((route) => route.kind !== "existing" && route.kind !== "agent");
  assert.equal(routes.length, 22);
  for (const route of routes) {
    const item = WORKSPACE_PAGE_CONTENT[route.id];
    assert.ok(item, "missing content for " + route.id);
    assert.ok(item.title && item.description && item.eyebrow && item.image);
    assert.ok(item.sections.length > 0);
  }
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
    ["prompt-library", "PromptLibraryPanel"],
    ["activity", "RunList"],
    ["observability", "ObservabilityPanel"],
    ["governance", "GovernancePanel"],
    ["policies", "PolicyPanel"],
    ["runtime", "RuntimePanel"],
    ["access", "AccessPanel"],
  ];
  for (const [kind, component] of routes) {
    assert.ok(source.includes('if(route.kind==="' + kind + '")return <' + component), kind + " must render " + component);
  }
  assert.ok(!source.includes('route.kind==="launchpad"||route.kind==="prompt-library"'));
  assert.ok(!source.includes('["governance","policies"].includes(route.kind)'));
  assert.ok(!source.includes('["runtime","access"].includes(route.kind)'));
  assert.ok(source.includes("filterTaskTemplates(TASK_TEMPLATES,query,category)"));
  assert.ok(source.includes("runStats={runStats}"));
});
