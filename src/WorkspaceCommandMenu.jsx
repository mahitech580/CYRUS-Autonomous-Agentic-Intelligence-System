import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Command, Search, X } from "lucide-react";
import { WORKSPACE_ROUTES } from "./lib/routes.js";
import { filterWorkspaceRoutes } from "./lib/navigation.js";

export default function WorkspaceCommandMenu({ open, onClose, onNavigate, currentRouteId }) {
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => filterWorkspaceRoutes(query, WORKSPACE_ROUTES), [query]);
  const activeRoute = results[activeIndex] || results[0] || null;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return undefined;
    }
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    searchRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function closeMenu() {
    onClose();
  }

  function chooseRoute(route) {
    onNavigate(route.id);
    onClose();
  }

  function handleSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current + 1) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (event.key === "Home" && results.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && results.length) {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === "Enter" && activeRoute) {
      event.preventDefault();
      chooseRoute(activeRoute);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="cyrus-command-dialog"
      aria-labelledby="cyrus-command-title"
      aria-describedby="cyrus-command-description"
      onCancel={(event) => {
        event.preventDefault();
        closeMenu();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeMenu();
      }}
    >
      <div className="cyrus-command-header">
        <span className="cyrus-command-mark" aria-hidden="true"><Command size={18} /></span>
        <div className="cyrus-command-heading">
          <h2 id="cyrus-command-title">Jump to a page</h2>
          <p id="cyrus-command-description">Search all {WORKSPACE_ROUTES.length} workspace destinations by name, group or route.</p>
        </div>
        <button type="button" className="cyrus-command-close" onClick={closeMenu} aria-label="Close page search">
          <X size={17} />
        </button>
      </div>

      <label className="cyrus-command-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search workspace pages</span>
        <input
          ref={searchRef}
          type="search"
          role="combobox"
          aria-label="Search workspace pages"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded="true"
          aria-controls="cyrus-command-results"
          aria-activedescendant={activeRoute ? "cyrus-command-option-" + activeRoute.id : undefined}
          placeholder="Search pages, groups or paths…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        <kbd>ESC</kbd>
      </label>

      <div className="cyrus-command-results-heading">
        <span>WORKSPACE DESTINATIONS</span>
        <span aria-live="polite" aria-atomic="true">{results.length} {results.length === 1 ? "page" : "pages"}</span>
      </div>
      <div id="cyrus-command-results" className="cyrus-command-results" role="listbox" aria-label="Workspace pages">
        {results.length ? results.map((route, index) => (
          <button
            id={"cyrus-command-option-" + route.id}
            key={route.id}
            type="button"
            role="option"
            aria-selected={activeRoute?.id === route.id}
            className={"cyrus-command-option" + (activeRoute?.id === route.id ? " is-active" : "")}
            onMouseMove={() => setActiveIndex(index)}
            onClick={() => chooseRoute(route)}
          >
            <span className="cyrus-command-option-copy">
              <strong>{route.label}</strong>
              <small>{route.group} <span aria-hidden="true">·</span> {route.path}</small>
            </span>
            <span className="cyrus-command-option-trailing">
              {route.id === currentRouteId ? <span className="cyrus-command-current">Current</span> : null}
              <ArrowRight size={15} aria-hidden="true" />
            </span>
          </button>
        )) : (
          <p className="cyrus-command-empty" role="status">No pages match “{query}”. Try a page name, group or route.</p>
        )}
      </div>

      <div className="cyrus-command-footer" aria-label="Keyboard instructions">
        <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span><kbd>↵</kbd> Open page</span>
        <span><kbd>Esc</kbd> Close</span>
      </div>
    </dialog>
  );
}
