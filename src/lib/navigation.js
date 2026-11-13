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

export function shouldOpenWorkspaceCommand(event) {
  if (!event || event.defaultPrevented || event.repeat) return false;
  if (String(event.key || "").toLowerCase() !== "k") return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;

  const target = event.target;
  if (target?.isContentEditable) return false;
  const tagName = String(target?.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tagName)) return false;
  if (typeof target?.closest === "function"
    && target.closest("[contenteditable='true'], [role='textbox']")) return false;
  return true;
}
