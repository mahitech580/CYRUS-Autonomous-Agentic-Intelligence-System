const workspaceRoutes = Object.freeze([
  { view: "Overview", path: "/overview" },
  { view: "Agent fleet", path: "/agents" },
  { view: "Runs & tasks", path: "/runs" },
  { view: "Code review", path: "/review" },
  { view: "Deployments", path: "/deployments" },
  { view: "Integrations", path: "/integrations" },
  { view: "Settings", path: "/settings" },
]);

const routeByPath = new Map(workspaceRoutes.map((route) => [route.path, route.view]));
const routeByView = new Map(workspaceRoutes.map((route) => [route.view, route.path]));

export function getWorkspaceHref(view, options = {}) {
  const path = routeByView.get(view) || routeByView.get("Overview");
  const query = options.focusTask ? "?focus=task" : "";
  return "#" + path + query;
}

export function getViewFromHash(hash) {
  const value = String(hash || "").replace(/^#/, "");
  if (!value.startsWith("/")) return null;
  const path = value.split("?", 1)[0].replace(/\/+$/, "") || "/overview";
  return routeByPath.get(path.toLowerCase()) || null;
}

export function getRouteIntent(hash) {
  const value = String(hash || "").replace(/^#/, "");
  const queryIndex = value.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? value.slice(queryIndex + 1) : "");
}
