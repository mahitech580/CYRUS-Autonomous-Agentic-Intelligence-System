import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_ROUTES } from "../lib/routes.js";
import { TASK_TEMPLATES, WORKSPACE_PAGE_CONTENT } from "./page-data.js";

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
