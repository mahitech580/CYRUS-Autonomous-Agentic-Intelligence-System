function normalizeRouteSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filterWorkspaceRoutes(query, routes = []) {
  const candidates = Array.isArray(routes)
    ? routes.filter((route) => route && typeof route === "object")
    : [];
  const needle = normalizeRouteSearchValue(query);
  if (!needle) return candidates;

  const terms = needle.split(/\s+/).filter(Boolean);
  return candidates.filter((route) => {
    const searchable = normalizeRouteSearchValue([
      route.id,
      route.label,
      route.path,
      route.group,
      route.view,
    ].join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
