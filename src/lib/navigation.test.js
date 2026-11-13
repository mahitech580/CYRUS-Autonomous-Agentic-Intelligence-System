import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_ROUTES } from "./routes.js";
import { filterWorkspaceRoutes, shouldOpenWorkspaceCommand } from "./navigation.js";

test("an empty page-switcher query exposes all registered destinations", () => {
  assert.equal(filterWorkspaceRoutes("", WORKSPACE_ROUTES).length, 36);
  assert.equal(filterWorkspaceRoutes("   ", WORKSPACE_ROUTES).length, 36);
});

test("page search matches labels and route identifiers without case sensitivity", () => {
  assert.deepEqual(filterWorkspaceRoutes("  aTLAs ", WORKSPACE_ROUTES).map((route) => route.id), ["agent-atlas"]);
  assert.ok(filterWorkspaceRoutes("sentinel", WORKSPACE_ROUTES).some((route) => route.id === "agent-sentinel"));
});

test("page search matches full hash paths and navigation groups", () => {
  assert.deepEqual(filterWorkspaceRoutes("/integrations/github", WORKSPACE_ROUTES).map((route) => route.id), ["integration-github"]);
  assert.deepEqual(filterWorkspaceRoutes("governance", WORKSPACE_ROUTES).map((route) => route.id), [
    "governance",
    "governance-policies",
    "governance-audit",
  ]);
});

test("multi-term search matches words across labels, groups and route paths", () => {
  assert.deepEqual(filterWorkspaceRoutes("active execution", WORKSPACE_ROUTES).map((route) => route.id), ["runs-active"]);
  assert.deepEqual(filterWorkspaceRoutes("workflow governance audit", WORKSPACE_ROUTES).map((route) => route.id), ["governance-audit"]);
  assert.deepEqual(filterWorkspaceRoutes("github integrations", WORKSPACE_ROUTES).map((route) => route.id), ["integration-github"]);
});

test("search normalizes accents and punctuation consistently", () => {
  assert.deepEqual(filterWorkspaceRoutes("cafe", [{ id: "cafe-page", label: "Café" }]).map((route) => route.id), ["cafe-page"]);
  assert.deepEqual(filterWorkspaceRoutes("///", [{ id: "overview" }]).map((route) => route.id), ["overview"]);
});

test("malformed route entries are ignored without breaking page search", () => {
  const routes = [null, "invalid", { id: "overview", label: "Overview" }];
  assert.deepEqual(filterWorkspaceRoutes("overview", routes).map((route) => route.id), ["overview"]);
  assert.deepEqual(filterWorkspaceRoutes("", null), []);
});

test("unmatched page searches return an honest empty result", () => {
  assert.deepEqual(filterWorkspaceRoutes("not-a-real-destination", WORKSPACE_ROUTES), []);
});

test("global page shortcut accepts Ctrl/Cmd+K without extra modifiers", () => {
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true }), true);
  assert.equal(shouldOpenWorkspaceCommand({ key: "K", metaKey: true }), true);
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, altKey: true }), false);
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, shiftKey: true }), false);
  assert.equal(shouldOpenWorkspaceCommand({ key: "j", ctrlKey: true }), false);
});

test("global page shortcut does not steal keystrokes from editable controls", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, target: { tagName } }), false);
  }
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, target: { isContentEditable: true } }), false);
  assert.equal(shouldOpenWorkspaceCommand({
    key: "k",
    ctrlKey: true,
    target: { closest: (selector) => selector.includes("contenteditable") ? {} : null },
  }), false);
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, target: { tagName: "BODY" } }), true);
  assert.equal(shouldOpenWorkspaceCommand({ key: "k", ctrlKey: true, repeat: true }), false);
});
