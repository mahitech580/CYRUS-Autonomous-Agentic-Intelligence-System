export const WORKSPACE_ROUTES = Object.freeze([
  {
    "id": "overview",
    "path": "/overview",
    "label": "Overview",
    "view": "Overview",
    "group": "Workspace",
    "icon": "LayoutDashboard",
    "kind": "existing"
  },
  {
    "id": "launchpad",
    "path": "/launchpad",
    "label": "Launchpad",
    "view": "Workspace",
    "group": "Workspace",
    "icon": "Sparkles",
    "kind": "launchpad"
  },
  {
    "id": "agents",
    "path": "/agents",
    "label": "Agent fleet",
    "view": "Agent fleet",
    "group": "Agents",
    "icon": "Bot",
    "kind": "existing"
  },
  {
    "id": "agent-atlas",
    "path": "/agents/atlas",
    "label": "Atlas · Planner",
    "view": "Workspace",
    "group": "Agents",
    "icon": "Command",
    "kind": "agent",
    "agentId": "planner"
  },
  {
    "id": "agent-scout",
    "path": "/agents/scout",
    "label": "Scout · Research",
    "view": "Workspace",
    "group": "Agents",
    "icon": "Search",
    "kind": "agent",
    "agentId": "researcher"
  },
  {
    "id": "agent-forma",
    "path": "/agents/forma",
    "label": "Forma · Architect",
    "view": "Workspace",
    "group": "Agents",
    "icon": "Network",
    "kind": "agent",
    "agentId": "architect"
  },
  {
    "id": "agent-forge",
    "path": "/agents/forge",
    "label": "Forge · Builder",
    "view": "Workspace",
    "group": "Agents",
    "icon": "Code2",
    "kind": "agent",
    "agentId": "coder"
  },
  {
    "id": "agent-sentinel",
    "path": "/agents/sentinel",
    "label": "Sentinel · QA",
    "view": "Workspace",
    "group": "Agents",
    "icon": "ShieldCheck",
    "kind": "agent",
    "agentId": "tester"
  },
  {
    "id": "agent-lens",
    "path": "/agents/lens",
    "label": "Lens · Reviewer",
    "view": "Workspace",
    "group": "Agents",
    "icon": "GitPullRequest",
    "kind": "agent",
    "agentId": "reviewer"
  },
  {
    "id": "agent-orbit",
    "path": "/agents/orbit",
    "label": "Orbit · Release",
    "view": "Workspace",
    "group": "Agents",
    "icon": "Rocket",
    "kind": "agent",
    "agentId": "release"
  },
  {
    "id": "runs",
    "path": "/runs",
    "label": "Runs & tasks",
    "view": "Runs & tasks",
    "group": "Execution",
    "icon": "Workflow",
    "kind": "existing"
  },
  {
    "id": "runs-active",
    "path": "/runs/active",
    "label": "Active runs",
    "view": "Workspace",
    "group": "Execution",
    "icon": "Activity",
    "kind": "run-list",
    "filter": "active"
  },
  {
    "id": "runs-history",
    "path": "/runs/history",
    "label": "Run history",
    "view": "Workspace",
    "group": "Execution",
    "icon": "Timer",
    "kind": "run-list",
    "filter": "history"
  },
  {
    "id": "prompt-library",
    "path": "/runs/templates",
    "label": "Prompt library",
    "view": "Workspace",
    "group": "Execution",
    "icon": "FileCode2",
    "kind": "prompt-library"
  },
  {
    "id": "review",
    "path": "/review",
    "label": "Code review",
    "view": "Code review",
    "group": "Quality",
    "icon": "GitPullRequest",
    "kind": "existing"
  },
  {
    "id": "review-history",
    "path": "/review/history",
    "label": "Review history",
    "view": "Workspace",
    "group": "Quality",
    "icon": "CheckCircle2",
    "kind": "review-history"
  },
  {
    "id": "deployments",
    "path": "/deployments",
    "label": "Deployments",
    "view": "Deployments",
    "group": "Delivery",
    "icon": "Rocket",
    "kind": "existing"
  },
  {
    "id": "deploy-workspace",
    "path": "/deployments/workspace",
    "label": "Workspace app",
    "view": "Workspace",
    "group": "Delivery",
    "icon": "LayoutDashboard",
    "kind": "deployment",
    "target": "workspace"
  },
  {
    "id": "deploy-api",
    "path": "/deployments/api",
    "label": "API service",
    "view": "Workspace",
    "group": "Delivery",
    "icon": "Terminal",
    "kind": "deployment",
    "target": "api"
  },
  {
    "id": "ci-pipeline",
    "path": "/deployments/ci",
    "label": "CI pipeline",
    "view": "Workspace",
    "group": "Delivery",
    "icon": "GitBranch",
    "kind": "ci"
  },
  {
    "id": "integrations",
    "path": "/integrations",
    "label": "Integrations",
    "view": "Integrations",
    "group": "Integrations",
    "icon": "Boxes",
    "kind": "existing"
  },
  {
    "id": "integration-models",
    "path": "/integrations/models",
    "label": "AI provider",
    "view": "Workspace",
    "group": "Integrations",
    "icon": "Cpu",
    "kind": "integration",
    "integration": "models"
  },
  {
    "id": "integration-research",
    "path": "/integrations/research",
    "label": "Web research",
    "view": "Workspace",
    "group": "Integrations",
    "icon": "Globe2",
    "kind": "integration",
    "integration": "research"
  },
  {
    "id": "integration-github",
    "path": "/integrations/github",
    "label": "GitHub source",
    "view": "Workspace",
    "group": "Integrations",
    "icon": "Code2",
    "kind": "integration",
    "integration": "github"
  },
  {
    "id": "integration-database",
    "path": "/integrations/database",
    "label": "Database",
    "view": "Workspace",
    "group": "Integrations",
    "icon": "Database",
    "kind": "integration",
    "integration": "database"
  },
  {
    "id": "observability",
    "path": "/observability",
    "label": "Observability",
    "view": "Workspace",
    "group": "Observability",
    "icon": "Activity",
    "kind": "observability"
  },
  {
    "id": "observability-activity",
    "path": "/observability/activity",
    "label": "Activity stream",
    "view": "Workspace",
    "group": "Observability",
    "icon": "Radio",
    "kind": "activity"
  },
  {
    "id": "observability-queue",
    "path": "/observability/queue",
    "label": "Queue monitor",
    "view": "Workspace",
    "group": "Observability",
    "icon": "CircleDot",
    "kind": "queue"
  },
  {
    "id": "observability-usage",
    "path": "/observability/usage",
    "label": "Usage & tokens",
    "view": "Workspace",
    "group": "Observability",
    "icon": "Braces",
    "kind": "usage"
  },
  {
    "id": "governance",
    "path": "/governance",
    "label": "Governance",
    "view": "Workspace",
    "group": "Governance",
    "icon": "ShieldCheck",
    "kind": "governance"
  },
  {
    "id": "governance-policies",
    "path": "/governance/policies",
    "label": "Safety policies",
    "view": "Workspace",
    "group": "Governance",
    "icon": "LockKeyhole",
    "kind": "policies"
  },
  {
    "id": "governance-audit",
    "path": "/governance/audit",
    "label": "Workflow audit log",
    "view": "Workspace",
    "group": "Governance",
    "icon": "FileCode2",
    "kind": "audit"
  },
  {
    "id": "settings",
    "path": "/settings",
    "label": "Settings",
    "view": "Settings",
    "group": "Settings",
    "icon": "Settings2",
    "kind": "existing"
  },
  {
    "id": "settings-runtime",
    "path": "/settings/runtime",
    "label": "Runtime health",
    "view": "Workspace",
    "group": "Settings",
    "icon": "Terminal",
    "kind": "runtime"
  },
  {
    "id": "settings-access",
    "path": "/settings/access",
    "label": "Workspace access",
    "view": "Workspace",
    "group": "Settings",
    "icon": "LockKeyhole",
    "kind": "access"
  },
  {
    "id": "settings-appearance",
    "path": "/settings/appearance",
    "label": "Appearance",
    "view": "Workspace",
    "group": "Settings",
    "icon": "Sparkles",
    "kind": "appearance"
  }
]);
const routeById = new Map(WORKSPACE_ROUTES.map((route) => [route.id, route]));
const routeByPath = new Map(WORKSPACE_ROUTES.map((route) => [route.path, route]));
const routeByLabel = new Map(WORKSPACE_ROUTES.map((route) => [route.label.toLowerCase(), route]));
const routeByView = new Map(WORKSPACE_ROUTES.filter((route) => route.view !== "Workspace").map((route) => [route.view.toLowerCase(), route]));
const groupLabels = [...new Set(WORKSPACE_ROUTES.map((route) => route.group))];

export const WORKSPACE_NAV_GROUPS = Object.freeze(groupLabels.map((label) => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  label,
  routes: WORKSPACE_ROUTES.filter((route) => route.group === label),
})));

function pathFromHash(hash) {
  const value = String(hash || "").replace(/^#/, "");
  if (!value.startsWith("/")) return null;
  return (value.split("?", 1)[0].replace(/\/+$/, "") || "/overview").toLowerCase();
}

export function getWorkspaceRoute(target) {
  const value = String(target || "");
  if (value.startsWith("#")) {
    const path = pathFromHash(value);
    return path ? routeByPath.get(path) || null : null;
  }
  if (value.startsWith("/")) return routeByPath.get(value.replace(/\/+$/, "").toLowerCase() || "/overview") || null;
  const key = value.toLowerCase();
  return routeById.get(key) || routeByLabel.get(key) || routeByView.get(key) || null;
}

export function getWorkspaceHref(target, options = {}) {
  const route = getWorkspaceRoute(target) || routeById.get("overview");
  const intent = new URLSearchParams(options.search || "");
  if (options.focusTask) intent.set("focus", "task");
  const query = intent.toString();
  return "#" + route.path + (query ? "?" + query : "");
}

export function getViewFromHash(hash) {
  return getWorkspaceRoute(hash)?.view || null;
}

export function getRouteIntent(hash) {
  const value = String(hash || "").replace(/^#/, "");
  const queryIndex = value.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? value.slice(queryIndex + 1) : "");
}
