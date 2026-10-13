(function configureCyrusRuntime(root) {
  "use strict";
  const DEFAULT_API_BASE_URL = "https://cyrus-agentic-api-mahitech580.onrender.com";
  let override = "";
  try {
    override = String(root.localStorage.getItem("cyrus-api-base-url") || "").trim();
  } catch {
    // Browser privacy settings can disable storage; use the deployed default.
  }
  const apiBaseUrl = (override || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  let apiAccessKey = "";
  try {
    // A tab-scoped key can be typed by the operator; never publish it in the repo.
    apiAccessKey = String(root.sessionStorage.getItem("cyrus-api-access-key") || "").trim();
  } catch {
    // Connection remains usable for backends that do not require a shared key.
  }
  root.CYRUS_CONFIG = Object.freeze({
    apiBaseUrl,
    defaultApiBaseUrl: DEFAULT_API_BASE_URL,
    apiAccessKey,
    runtime: "remote-api"
  });
})(typeof window !== "undefined" ? window : globalThis);
