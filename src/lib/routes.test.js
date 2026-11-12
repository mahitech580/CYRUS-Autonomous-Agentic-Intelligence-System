import assert from "node:assert/strict";
import test from "node:test";
import { getRouteIntent, getViewFromHash, getWorkspaceHref } from "./routes.js";

test("every workspace view has a unique shareable anchor destination", () => {
  const views = ["Overview", "Agent fleet", "Runs & tasks", "Code review", "Deployments", "Integrations", "Settings"];
  const hrefs = views.map((view) => getWorkspaceHref(view));
  assert.equal(new Set(hrefs).size, views.length);
  for (const href of hrefs) assert.equal(getViewFromHash(href), views[hrefs.indexOf(href)] || views[0]);
});

test("route destinations resolve independently of query-string intent", () => {
  assert.equal(getViewFromHash("#/agents"), "Agent fleet");
  assert.equal(getViewFromHash("#/runs?focus=task"), "Runs & tasks");
  assert.equal(getViewFromHash("#/review?source=overview"), "Code review");
  assert.equal(getViewFromHash("#/settings?tab=runtime"), "Settings");
});

test("unknown and in-page anchor hashes are not treated as workspace routes", () => {
  assert.equal(getViewFromHash("#main-content"), null);
  assert.equal(getViewFromHash("#/missing"), null);
  assert.equal(getViewFromHash(""), null);
});

test("new-task links carry an explicit focus intent", () => {
  const href = getWorkspaceHref("Runs & tasks", { focusTask: true });
  assert.equal(href, "#/runs?focus=task");
  assert.equal(getRouteIntent(href).get("focus"), "task");
  assert.equal(getRouteIntent("#/runs").get("focus"), null);
});
