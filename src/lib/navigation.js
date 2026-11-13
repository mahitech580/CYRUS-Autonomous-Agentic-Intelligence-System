export function filterWorkspaceRoutes(query, routes = []) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return routes;
  return routes.filter((route) => [
    route.id,
    route.label,
    route.path,
    route.group,
    route.view,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle)));
}
