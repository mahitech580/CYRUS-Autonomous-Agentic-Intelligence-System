import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_NAV_GROUPS, WORKSPACE_ROUTES, getRouteIntent, getViewFromHash, getWorkspaceHref, getWorkspaceRoute } from "./routes.js";

test("CYRUS exposes 36 unique directly addressable workspace pages", () => {
  assert.equal(WORKSPACE_ROUTES.length, 36);
  assert.equal(new Set(WORKSPACE_ROUTES.map((route) => route.id)).size, 36);
  assert.equal(new Set(WORKSPACE_ROUTES.map((route) => route.path)).size, 36);
  for (const route of WORKSPACE_ROUTES) {
    assert.equal(getWorkspaceRoute(route.id)?.id, route.id);
    assert.equal(getWorkspaceRoute(route.path)?.id, route.id);
    assert.equal(getWorkspaceRoute(getWorkspaceHref(route.id))?.id, route.id);
  }
});

test("all routes are exposed through nine grouped navigation sections", () => {
  const items = WORKSPACE_NAV_GROUPS.flatMap((group) => group.routes);
  assert.equal(WORKSPACE_NAV_GROUPS.length, 9);
  assert.equal(items.length, 36);
});

test("legacy operational views keep their original React view names", () => {
  for (const [view,path] of [["Overview","/overview"],["Agent fleet","/agents"],["Runs & tasks","/runs"],["Code review","/review"],["Deployments","/deployments"],["Integrations","/integrations"],["Settings","/settings"]]) {
    assert.equal(getWorkspaceRoute(view)?.path, path);
    assert.equal(getViewFromHash("#" + path), view);
  }
});

test("secondary agent and run routes carry their metadata", () => {
  assert.equal(getWorkspaceRoute("#/agents/forge")?.agentId, "coder");
  assert.equal(getWorkspaceRoute("#/runs/history")?.filter, "history");
  assert.equal(getViewFromHash("#/runs/history"), "Workspace");
});

test("query intent does not change route matching", () => {
  assert.equal(getWorkspaceRoute("#/runs?focus=task")?.id, "runs");
  assert.equal(getRouteIntent("#/runs?focus=task").get("focus"), "task");
  assert.equal(getWorkspaceHref("runs", {focusTask:true}), "#/runs?focus=task");
});

test("unknown and in-page anchors do not become workspace routes", () => {
  assert.equal(getWorkspaceRoute("#main-content"), null);
  assert.equal(getWorkspaceRoute("#/missing"), null);
  assert.equal(getWorkspaceRoute(""), null);
});
