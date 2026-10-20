(function configureCyrusRuntime(root) {
  "use strict";
  const DEFAULT_API_BASE_URL = "https://cyrus-agentic-api-mahitech580.onrender.com";
  const query = new URLSearchParams(String(root.location?.search || ""));
  // Demo mode is an explicit URL opt-in. Normal deployments stay fail-closed
  // against the configured API instead of masking a backend outage with mock work.
  const explicitDemoMode = query.get("demo") === "1";
  let override = "";
  try {
    override = String(root.localStorage.getItem("cyrus-api-base-url") || "").trim();
  } catch {
    // Browser privacy settings can disable storage; use the deployed default.
  }
  const apiBaseUrl = explicitDemoMode ? "" : (override || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  let apiAccessKey = "";
  try {
    // A tab-scoped key can be typed by the operator; never publish it in the repo.
    apiAccessKey = explicitDemoMode ? "" : String(root.sessionStorage.getItem("cyrus-api-access-key") || "").trim();
  } catch {
    // Connection remains usable for backends that do not require a shared key.
  }
  root.CYRUS_CONFIG = Object.freeze({
    apiBaseUrl,
    defaultApiBaseUrl: DEFAULT_API_BASE_URL,
    apiAccessKey,
    runtime: explicitDemoMode ? "browser-demo" : "remote-api",
    explicitDemoMode
  });
})(typeof window !== "undefined" ? window : globalThis);
