const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("node:vm");

const index = fs.readFileSync("index.html", "utf8");
for (const asset of ["./styles.css", "./runtime-config.js", "./demo-bridge.js", "./event-stream.js", "./task-export.js", "./app.js"]) {
  assert.ok(index.includes('src="' + asset + '"') || index.includes('href="' + asset + '"'), "Missing asset reference: " + asset);
  const path = asset.slice(2);
  assert.ok(fs.existsSync(path), "Missing referenced asset: " + path);
}

assert.ok(index.includes('type="text/babel"'), "React JSX entry must use the Babel loader");
assert.ok(index.includes("react.production.min.js"), "The deployed UI must use the production React bundle");
assert.ok(index.includes("react-dom.production.min.js"), "The deployed UI must use the production ReactDOM bundle");
assert.ok(index.includes('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'), "The 3D character runtime must load Three.js before the app");
assert.ok(fs.readFileSync("app.js", "utf8").includes("healthMetrics"), "Bootstrap must consume runtime metrics");

const runtimeConfigSource = fs.readFileSync("runtime-config.js", "utf8");
function buildRuntimeConfig(search, apiOverride, accessKey) {
  const window = {
    location: {search},
    localStorage: {getItem(key) { return key === "cyrus-api-base-url" ? apiOverride : null; }},
    sessionStorage: {getItem(key) { return key === "cyrus-api-access-key" ? accessKey : null; }}
  };
  vm.runInNewContext(runtimeConfigSource, {window, URLSearchParams, String, Object});
  return window.CYRUS_CONFIG;
}
const localDemoConfig = buildRuntimeConfig("?demo=1", "https://unexpected.example", "not-for-demo");
assert.equal(localDemoConfig.runtime, "browser-demo");
assert.equal(localDemoConfig.explicitDemoMode, true);
assert.equal(localDemoConfig.apiBaseUrl, "", "Explicit demo must not call the configured remote backend");
assert.equal(localDemoConfig.apiAccessKey, "", "Explicit demo must not send the operator's live API key");
const liveConfig = buildRuntimeConfig("", "https://custom-api.example", "live-key-not-committed");
assert.equal(liveConfig.runtime, "remote-api");
assert.equal(liveConfig.explicitDemoMode, false);
assert.equal(liveConfig.apiBaseUrl, "https://custom-api.example");
assert.equal(liveConfig.apiAccessKey, "live-key-not-committed");
assert.ok(fs.readFileSync("app.js", "utf8").includes('window.CYRUS_CONFIG?.explicitDemoMode'), "UI must visibly distinguish the explicit local demo");
assert.ok(fs.readFileSync("app.js", "utf8").includes("health.mode==='DEMO'"), "Browser demo health must not be presented as live backend uptime");
assert.ok(fs.readFileSync("styles.css", "utf8").includes(".demo-mode-banner"), "The local demo disclosure must be responsive and styled");

assert.ok(fs.readFileSync("app.js", "utf8").includes("window.CyrusEventStream.streamTaskEvents"), "App must use the resilient event-stream client");
const app = fs.readFileSync("app.js", "utf8");
for (const feature of [
  "Search execution history",
  "Filter executions by status",
  "Sort execution history",
  "EXPORT CSV",
  "Highest score",
  "No matching executions",
  "cyrus-execution-history-"
]) {
  assert.ok(app.includes(feature), "Missing History operator feature: " + feature);
}
for (const style of [".history-overview", ".history-filters", ".history-empty", "@media(max-width:780px)"]) {
  assert.ok(fs.readFileSync("styles.css", "utf8").includes(style), "Missing History responsive style: " + style);
}

console.log("deployment smoke: index assets and bootstrap contract OK");

const refreshedApp = fs.readFileSync("app.js", "utf8");
for (const feature of ["function PageHero","page-agents","registry-grid","page-memory","memory-gallery","page-tools","tool-library","HISTORY / EXECUTION LEDGER","CYRUS_IMAGES","images.unsplash.com"]) {
  assert.ok(refreshedApp.includes(feature), "Missing visual redesign feature: " + feature);
}
const refreshedCss = fs.readFileSync("styles.css", "utf8");
for (const style of ["--trip-green:#2fbb78","--trip-red:#b83d35",".editorial-hero",".page-stat-rail",".registry-grid",".tool-category-grid",".memory-gallery","prefers-reduced-motion:reduce"]) {
  assert.ok(refreshedCss.includes(style), "Missing TripPilot-inspired style: " + style);
}


const motionSource = fs.readFileSync("app.js", "utf8");
for (const feature of [
  "motion-progress",
  "motion-reveal",
  "motion-tilt",
  "IntersectionObserver",
  "prefers-reduced-motion: reduce",
  "CyrusCharacter",
  "HomeView",
  "command-stats-grid",
  "agent-map-lines",
  "doom-webgl-root",
  "cyrus-scroll-cue",
  "motion-scroll-progress"
]) {
  assert.ok(motionSource.includes(feature), "Missing motion system behavior: " + feature);
}
const motionStyles = fs.readFileSync("styles.css", "utf8");
for (const style of [
  ".motion-progress",
  ".motion-tilt.is-tilting",
  ".motion-architecture",
  "transform-style:preserve-3d",
  "@keyframes motion-orbit-a",
  "@keyframes motion-cube-float",
  "@keyframes motion-row-in",
  "@media(prefers-reduced-motion:reduce)"
]) {
  assert.ok(motionStyles.includes(style), "Missing 3D motion style: " + style);
}


assert.ok(fs.readFileSync("app.js", "utf8").includes("cyrus-motion"), "Motion preference must persist between visits");
assert.ok(fs.readFileSync("app.js", "utf8").includes("aria-pressed={motionEnabled}"), "Motion toggle must expose its state accessibly");
assert.ok(fs.readFileSync("app.js", "utf8").includes("motionEnabled?'MOTION ON':'CALM MODE'"), "Motion control must have clear on/off labels");
assert.ok(fs.readFileSync("styles.css", "utf8").includes("html.motion-disabled"), "Calm mode must suppress animation and tilt styles");

assert.ok(fs.readFileSync("app.js", "utf8").includes("--motion-image-x"), "Pointer input must drive image parallax");
assert.ok(fs.readFileSync("app.js", "utf8").includes("removeProperty('--motion-image-x')"), "Image parallax variables must be cleaned when the pointer leaves");
assert.ok(fs.readFileSync("styles.css", "utf8").includes("translate3d(var(--motion-image-x,0px),var(--motion-image-y,0px),0)"), "Image parallax must use browser-safe pixel transforms");

for (const feature of ["function HomeView","I am","CYRUS.","home-feature-rail","function CommandView","Recent Executions","Live Agent Graph","function toolGroup","Search execution memory"]) {
  assert.ok(refreshedApp.includes(feature), "Missing CYRUS character experience: " + feature);
}
for (const style of [".cyrus-hero-visual", ".doom-webgl-root", ".cyrus-origin-grid", "@keyframes cyrus-portrait-arrive", ".doom-css-fallback"]) {
  assert.ok(refreshedCss.includes(style), "Missing CYRUS cinematic character styling: " + style);
}

const doomApp = fs.readFileSync("app.js", "utf8");
for (const feature of ["VICTOR VON DOOM","new T.WebGLRenderer","new T.Scene","new T.ExtrudeGeometry","spinRig.rotation.y","new T.Sprite","onPointerMove","--doom-tilt-x","doom-smoke-puff","RULER OF LATVERIA"]) {
  assert.ok(doomApp.includes(feature), "Missing Doctor Doom scene behavior: " + feature);
}
const doomCss = fs.readFileSync("styles.css", "utf8");
for (const style of ["@keyframes doom-rotate-3d","@keyframes doom-smoke-rise","doom-ground-fog","preserve-3d","--bg:#020603","@media(prefers-reduced-motion:reduce)",".doom-webgl-canvas",".webgl-ready .doom-css-fallback"]) {
  assert.ok(doomCss.includes(style), "Missing Doom animation / green-theme style: " + style);
}
console.log("Doom scene smoke: 3D turntable, green smoke, and forest-green theme OK");

for (const feature of [
  "doom-character-controls",
  "ROTATION ON",
  "ROTATION PAUSED",
  "SMOKE ",
  "PARTICLES ",
  "CINEMATIC",
  "RESET VIEW",
  "controlsRef.current.rotationOn",
  "controlsRef.current.smokeOn",
  "controlsRef.current.embersOn",
  "controlsRef.current.cinematic",
  "handleVisibilityChange",
  "document.visibilityState!=='hidden'",
  "targetFov=controlsRef.current.cinematic?28:35"
]) {
  assert.ok(fs.readFileSync("app.js", "utf8").includes(feature), "Missing interactive scene feature: " + feature);
}
for (const style of [".doom-character-controls", ".doom-scene.doom-no-smoke", ".doom-scene.doom-cinematic", ".doom-reset-view"]) {
  assert.ok(fs.readFileSync("styles.css", "utf8").includes(style), "Missing interactive scene control styling: " + style);
}
console.log("Doom interaction smoke: rotation, smoke, particles, cinematic zoom, and tab visibility controls OK");

const runtimeConfig = fs.readFileSync("runtime-config.js", "utf8");
assert.ok(runtimeConfig.includes("cyrus-agentic-api-mahitech580.onrender.com"), "Frontend must point to the Render API Blueprint hostname");
assert.ok(runtimeConfig.includes("cyrus-api-base-url"), "API URL must be configurable from the UI");
assert.ok(fs.readFileSync("event-stream.js", "utf8").includes("root.CYRUS_CONFIG?.apiBaseUrl"), "SSE must connect to the configured live backend");
assert.ok(fs.readFileSync("demo-bridge.js", "utf8").includes("window.CYRUS_CONFIG?.apiBaseUrl"), "Browser demo fallback must not mask a configured backend outage");
assert.ok(fs.readFileSync("app.js", "utf8").includes("function ApiSettingsModal"), "App must include a live backend connection dialog");
const blueprint = fs.readFileSync("render.yaml", "utf8");
assert.ok(blueprint.includes("healthCheckPath: /api/health"), "Render Blueprint must health-check the API");
assert.ok(blueprint.includes("server:app"), "Render Blueprint must start the Flask application");
assert.ok(fs.readFileSync("requirements.txt", "utf8").includes("gunicorn==23.0.0"), "Production WSGI server must be installed");
console.log("realtime deployment smoke: API config, CORS deployment assets, SSE URL, and Render Blueprint OK");

for (const feature of ["X-CYRUS-Access-Key","cyrus-api-access-key","static_analysis?.checks","STATIC ANALYSIS","sessionStorage.setItem('cyrus-api-access-key'"]) {
  assert.ok(fs.readFileSync("app.js","utf8").includes(feature), "Missing runtime-hardening UI feature: " + feature);
}
assert.ok(fs.readFileSync("runtime-config.js","utf8").includes("sessionStorage.getItem(\"cyrus-api-access-key\")"), "Access key must be scoped to the browser tab");
assert.ok(fs.readFileSync("event-stream.js","utf8").includes('headers["X-CYRUS-Access-Key"]'), "SSE requests must pass the optional access key");
assert.ok(fs.readFileSync("server.py","utf8").includes('def security_info()'), "API must expose its non-secret security posture");
assert.ok(fs.readFileSync("server.py","utf8").includes('hmac.compare_digest'), "API access keys must be compared in constant time");
assert.ok(fs.readFileSync("static_analysis.py","utf8").includes("ast.parse"), "Generated Python should be parsed without execution");
assert.ok(fs.existsSync("tests/test_static_analysis.py"), "Static-analysis safety tests must exist");
console.log("runtime hardening smoke: optional access-key gate, authenticated SSE, and draft static-analysis inspection OK");

const platformApp = fs.readFileSync("app.js", "utf8");
for (const feature of [
  "const NAV_ITEMS=['Home','Platform','Command','Analytics','Agents','Memory','Tools','History']",
  "function PlatformView",
  "RUNTIME TELEMETRY / AUTO-REFRESH 12 SEC",
  "Promise.allSettled(paths.map(path=>apiJson(path)))",
  "/api/health",
  "/api/provider",
  "/api/security",
  "/api/metrics",
  "/api/tasks?limit=8",
  "THE EXECUTION LIFECYCLE / 07 STAGES",
  "What the system",
  "NO FAKE GREEN CHECKS",
  "static_analysis",
  "API connection settings",
  "See what is real.",
  "Explore platform & live diagnostics"
]) {
  assert.ok(platformApp.includes(feature), "Missing live Platform workspace capability: " + feature);
}
const platformCss = fs.readFileSync("styles.css", "utf8");
for (const style of [
  ".home-platform-preview",
  ".home-platform-preview-grid",
  ".platform-live-console",
  ".platform-telemetry-grid",
  ".platform-lifecycle-grid",
  ".platform-capability-grid",
  ".platform-guardrails-grid",
  "@media(max-width:520px)"
]) {
  assert.ok(platformCss.includes(style), "Missing responsive Platform styles: " + style);
}
console.log("Platform workspace smoke: new navigation, live diagnostics, seven-stage explainer, and responsive sections OK");


const analyticsApp = fs.readFileSync("app.js", "utf8");
for (const feature of [
  "function AnalyticsView",
  "/api/analytics?days=",
  "ANALYTICS ENDPOINT UNAVAILABLE",
  "No seeded chart values or placeholder success rates",
  "Runtime providers",
  "Failure signatures",
  "Latency profile",
  "CHECK DURABILITY",
  "CYRUS_DATABASE_URL",
  "Database-backed execution history"
]) {
  assert.ok(analyticsApp.includes(feature) || fs.readFileSync("README.md", "utf8").includes(feature), "Missing dynamic analytics / database feature: " + feature);
}
const analyticsCss = fs.readFileSync("styles.css", "utf8");
for (const style of [
  ".analytics-stat-grid",
  ".analytics-main-grid",
  ".analytics-chart",
  ".analytics-status-list",
  ".analytics-provider-list",
  ".analytics-failure-list",
  ".analytics-recent-row",
  "@media(max-width:520px)"
]) {
  assert.ok(analyticsCss.includes(style), "Missing responsive analytics component style: " + style);
}
const backend = fs.readFileSync("server.py", "utf8");
for (const feature of [
  "@app.get(\"/api/analytics\")",
  "def all_task_records()",
  "request.args.get(\"offset\"",
  "request.args.get(\"q\"",
  "HISTORY_STORE.info()"
]) {
  assert.ok(backend.includes(feature), "Missing database-backed API feature: " + feature);
}
assert.ok(fs.readFileSync("storage.py", "utf8").includes("CREATE TABLE IF NOT EXISTS"), "Database history schema must be initialized");
assert.ok(fs.existsSync("tests/test_storage.py"), "Database persistence tests must exist");
assert.ok(fs.existsSync("tests/test_analytics_api.py"), "Analytics API contract tests must exist");
console.log("Dynamic analytics smoke: real-data dashboard, API search, DB-backed history and responsive layout OK");

assert.ok(fs.readFileSync("server.py", "utf8").includes('"runtime-config.js", "event-stream.js"'), "Local Flask must serve the two runtime JS assets referenced by index.html");
assert.ok(fs.readFileSync("app.js", "utf8").includes(".replace(/_/g,'-')"), "Recovery categories must normalize underscores to the hyphenated CSS taxonomy");
assert.ok(fs.readFileSync("app.js", "utf8").includes("task-recovery-budget"), "Recovery guidance must disclose retry usage and eligibility");
assert.ok(fs.readFileSync("app.js", "utf8").includes("task-recovery-action"), "Recovery panel must render the stable recommended-action code");
assert.ok(fs.readFileSync("styles.css", "utf8").includes(".task-recovery-budget.eligible"), "Eligible retry budget must have a distinct visual state");
assert.ok(fs.readFileSync("styles.css", "utf8").includes(".task-recovery-budget.exhausted"), "Exhausted or unavailable retry budget must have a distinct visual state");
assert.ok(fs.readFileSync("app.js", "utf8").includes("Use HTTPS for remote backends."), "API settings must disallow plaintext remote backend URLs");
assert.ok(fs.readFileSync("app.js", "utf8").includes("apiJson('/api/tasks?'+params.toString())"), "History search must query the backend instead of filtering only the initially loaded page");

assert.ok(fs.readFileSync("server.py", "utf8").includes("RECOVERED_INTERRUPTED_RUNS = recover_interrupted_runs()"), "Startup must recover stale executions");
assert.ok(fs.readFileSync("server.py", "utf8").includes('live_model_requires_api_access_key'), "Readiness must explain why live model use is locked");
assert.ok(fs.readFileSync("tests/test_api.py", "utf8").includes("test_recovery_marks_interrupted_runs_failed"), "Interrupted task recovery must have a regression test");


const atmosphereApp = fs.readFileSync("app.js", "utf8");
for (const feature of [
  "const ATMOSPHERE_PRESETS",
  "function AmbientCanvas",
  "function AtmosphereStudio",
  "cyrus-atmosphere-preset",
  "cyrus-atmosphere-intensity",
  "prefers-reduced-motion: reduce",
  "navigator.connection?.saveData",
  "document.addEventListener('visibilitychange',visibility)",
  "pointermove",
  "className=\"ambient-canvas\"",
  "role=\"dialog\"",
  "aria-modal=\"true\"",
  "Open Atmosphere Studio",
  "APPLY FIELD",
  "Math.round(baseParticles*(.58+liveIntensity*.55))"
]) {
  assert.ok(atmosphereApp.includes(feature), "Missing Atmosphere Studio / performance behavior: " + feature);
}
const atmosphereCss = fs.readFileSync("styles.css", "utf8");
for (const style of [
  ".ambient-canvas",
  ".atmosphere-backdrop",
  ".atmosphere-studio",
  ".atmosphere-preview",
  ".atmosphere-presets",
  ".atmosphere-slider",
  ".atmosphere-footer",
  "@keyframes atmosphere-preview-spin",
  "@media(max-width:650px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  assert.ok(atmosphereCss.includes(style), "Missing Atmosphere Studio responsive style: " + style);
}
console.log("Atmosphere Studio smoke: saved presets, live canvas, intensity, reduced-motion, visibility pause, accessible dialog, responsive layout OK");

assert.ok(atmosphereApp.includes("drawRef.current?.()},[intensity])"), "Static ambient rendering must update without recreating the canvas on slider movement");
assert.ok(atmosphereApp.includes("particles.slice(0,visibleCount)"), "The intensity slider must control visible particle density");
assert.ok(atmosphereApp.includes("window.addEventListener('pointermove',pointerMove,{passive:true})"), "Ambient cursor response should use passive pointer handling");


for (const feature of [
  "const ATMOSPHERE_MODES",
  "cyrus-atmosphere-mode",
  "mode==='aurora'",
  "mode==='grid'",
  "mode==='constellation'",
  "BACKGROUND MOTION",
  "4 VISUAL MODES"
]) {
  assert.ok(atmosphereApp.includes(feature), "Missing selectable procedural background mode: " + feature);
}
for (const style of [
  ".atmosphere-modes",
  ".atmosphere-mode-art.aurora",
  ".atmosphere-mode-art.grid",
  ".atmosphere-mode-art.constellation",
  ".atmosphere-preview[data-mode=\"grid\"]",
  "@media(max-width:420px)"
]) {
  assert.ok(atmosphereCss.includes(style), "Missing background mode styling: " + style);
}
console.log("Atmosphere mode smoke: 4 distinct render modes, persistence, previews, and responsive controls OK");

const commandPaletteApp = fs.readFileSync("app.js", "utf8");
for (const command of [
  "Cycle Background Mode",
  "Reset Atmosphere Defaults",
  "Decrease Background Intensity",
  "Increase Background Intensity",
  "Enable Calm Mode",
  "Enable Immersive Motion",
  "Search pages, visual controls, or actions...",
  "palette-command-hint",
  "role=\"listbox\"",
  "role=\"option\"",
  "role=\"status\"",
  "const cycleAtmosphereMode=()=>",
  "const resetAtmosphere=()=>",
  "const nudgeAtmosphereIntensity=step=>",
  "Math.max(.25,Math.min(1.4,atmosphereIntensity+step*.15))"
]) {
  assert.ok(commandPaletteApp.includes(command), "Missing command-palette operator control: " + command);
}
console.log("Command palette smoke: keyboard navigation, accessible results, motion toggle, background cycling, reset and intensity controls OK");

const lineageServer = fs.readFileSync("server.py", "utf8");
const lineageApp = fs.readFileSync("app.js", "utf8");
const lineageStyles = fs.readFileSync("styles.css", "utf8");
const lineageExports = fs.readFileSync("task-export.js", "utf8");
for (const contract of [
  '@app.get("/api/tasks/<task_id>/lineage")',
  '"current_task_id": task_id',
  '"root_task_id": root_id',
  '"attempts": attempts',
  'while queue and len(ordered_ids) < 50'
]) {
  assert.ok(lineageServer.includes(contract), "Missing bounded lineage API contract: " + contract);
}
for (const feature of [
  "function TaskModal",
  "+'/lineage'",
  "RETRY LINEAGE",
  "task-lineage-list",
  "aria-current",
  "effective_max_task_retries"
]) {
  assert.ok(lineageApp.includes(feature), "Missing retry lineage inspector feature: " + feature);
}
for (const style of [
  ".task-lineage-list",
  ".task-lineage-row.current",
  ".task-lineage-status.status-failed",
  "@media(max-width:700px)"
]) {
  assert.ok(lineageStyles.includes(style), "Missing retry lineage timeline style: " + style);
}
for (const reportFeature of [
  "'retry_lineage'",
  "'## Retry lineage'",
  "['Retry lineage', 'retry_lineage']"
]) {
  assert.ok(lineageExports.includes(reportFeature), "Missing retry lineage report field: " + reportFeature);
}
assert.ok(fs.readFileSync("tests/test_api.py", "utf8").includes("test_task_lineage_returns_root_to_leaf_summaries"), "Lineage ordering must have an API regression test");
assert.ok(fs.readFileSync("tests/test_task_export.js", "utf8").includes("preserves retry lineage across JSON"), "Lineage export must have report regression coverage");
assert.ok(fs.readFileSync("tests/test_api.py", "utf8").includes("test_recovery_guidance_tokenizes_exception_names_without_false_matches"), "Backend recovery diagnosis must match exception tokens");
assert.ok(fs.readFileSync("tests/test_demo_bridge.js", "utf8").includes("GeneratedArtifactError"), "Browser demo recovery categories must use the same token boundaries");
assert.ok(fs.readFileSync("server.py", "utf8").includes('category = "rate_limited"'), "Rate-limit failures must have a specific recovery path");
assert.ok(fs.readFileSync("server.py", "utf8").includes('"recommended_action": action_code'), "Recovery API must expose stable operator action codes");
assert.ok(fs.readFileSync("demo-bridge.js", "utf8").includes("recommended_action: actionCode"), "Browser demo must mirror recovery action codes");
for (const errorType of [
  "ProviderAuthenticationError",
  "ProviderRateLimitError",
  "ProviderConnectionError",
  "ProviderTimeoutError",
  "ProviderUnavailableError",
  "ProviderBillingError",
  "ProviderRequestError",
  "ProviderResponseError"
]) {
  assert.ok(fs.readFileSync("providers.py", "utf8").includes("class " + errorType + "("), "Missing typed provider failure: " + errorType);
}
assert.ok(fs.readFileSync("providers.py", "utf8").includes("elif exc.code == 402:"), "HTTP 402 must select the billing-specific exception type");
assert.ok(fs.readFileSync("providers.py", "utf8").includes("error_type = ProviderBillingError"), "Billing response must remain typed before reaching runtime recovery guidance");
assert.ok(fs.readFileSync("providers.py", "utf8").includes("raise ProviderRateLimitError(message, retry_after_seconds=retry_after_seconds)"), "HTTP 429 must preserve a recovery-classifiable error type and bounded wait hint");
assert.ok(fs.readFileSync("server.py", "utf8").includes('action_code = "review_request_contract"'), "Rejected requests need dedicated safe guidance");
assert.ok(fs.readFileSync("server.py", "utf8").includes('action_code = "check_provider_billing"'), "Billing responses need dedicated recovery guidance");
assert.ok(fs.readFileSync("demo-bridge.js", "utf8").includes('actionCode = "check_provider_billing"'), "Browser demo must mirror billing remediation");
assert.ok(fs.readFileSync("tests/test_task_export.js", "utf8").includes("exports provider billing action without exposing raw provider diagnostics"), "Billing recovery exports need JSON/Markdown/CSV sanitization coverage");
assert.ok(fs.readFileSync("task-export.js", "utf8").includes("'recovery_guidance'"), "Safe recovery metadata must be included in the task-report allowlist");
assert.ok(fs.readFileSync("server.py", "utf8").includes('action_code = "inspect_response_format"'), "Malformed provider responses need dedicated safe guidance");
assert.ok(fs.readFileSync("demo-bridge.js", "utf8").includes('actionCode = "inspect_response_format"'), "Browser demo must mirror provider response guidance");
assert.ok(fs.readFileSync("providers.py", "utf8").includes("retry_after_seconds=retry_after_seconds"), "Provider Retry-After must be bounded before leaving the adapter");
assert.ok(fs.readFileSync("server.py", "utf8").includes('"retry_after_seconds": retry_after_seconds'), "Recovery API must expose validated Retry-After metadata");
assert.ok(fs.readFileSync("app.js", "utf8").includes("task-recovery-retry-after"), "Execution inspector must present Retry-After without automatic submission");
assert.ok(fs.readFileSync("app.js", "utf8").includes("recoveryGuidance.retry_after_seconds<=86400"), "UI must enforce the same 24-hour Retry-After display bound");
assert.ok(fs.readFileSync("styles.css", "utf8").includes(".task-recovery-retry-after"), "Retry-After warning needs a distinct visual state");
assert.ok(fs.readFileSync("demo-bridge.js", "utf8").includes('category = "rate_limited"'), "Browser demo must mirror rate-limit recovery guidance");
assert.ok(fs.readFileSync("styles.css", "utf8").includes(".task-recovery-category.rate-limited"), "Rate-limit recovery guidance needs a distinct status treatment");
console.log("Retry lineage smoke: bounded API, timeline UI, responsive styling and JSON/Markdown/CSV contracts OK");
const recoveryGuidanceServer = fs.readFileSync("server.py", "utf8");
const recoveryGuidanceApp = fs.readFileSync("app.js", "utf8");
const recoveryGuidanceStyles = fs.readFileSync("styles.css", "utf8");
assert.ok(recoveryGuidanceServer.includes('@app.get("/api/tasks/<task_id>/recovery")'), "Recovery guidance endpoint must be available");
assert.ok(recoveryGuidanceServer.includes('"source": "deterministic_runtime_guidance"'), "Recovery advice must identify its deterministic source");
assert.ok(recoveryGuidanceApp.includes("+'/recovery'"), "Execution inspector must request task recovery guidance");
assert.ok(recoveryGuidanceApp.includes("RECOVERY GUIDANCE"), "Execution inspector must expose the recovery guidance panel");
assert.ok(recoveryGuidanceApp.includes("Recovery guidance is unavailable on this backend"), "Recovery panel errors must not block the execution record");
for (const style of [".task-recovery-panel", ".task-recovery-body", ".task-recovery-synthetic", ".task-recovery-unavailable"]) {
  assert.ok(recoveryGuidanceStyles.includes(style), "Missing recovery guidance presentation: " + style);
}
assert.ok(fs.readFileSync("tests/test_api.py", "utf8").includes("test_recovery_guidance_classifies_timeout_and_does_not_echo_raw_errors"), "Recovery guidance must have a privacy regression test");
console.log("Recovery guidance smoke: API source, inspector panel, safe fallback, and privacy test wired OK");
assert.ok(recoveryGuidanceApp.includes("PREPARE RECOVERY OBJECTIVE"), "Failed records should offer an operator-reviewed recovery objective");
assert.ok(recoveryGuidanceApp.includes("Recovery objective prepared in Command. Review it before executing."), "Preparing recovery must remain a separate, non-executing action");
assert.ok(recoveryGuidanceStyles.includes(".task-recovery-prepare:focus-visible"), "Recovery preparation must have visible keyboard focus");
const recoveryHandlerStart = recoveryGuidanceApp.indexOf("const useRecoveryPlan=");
const recoveryHandlerEnd = recoveryGuidanceApp.indexOf("return <div className={'app-shell", recoveryHandlerStart);
assert.ok(recoveryHandlerStart >= 0 && recoveryHandlerEnd > recoveryHandlerStart, "Recovery preparation handler must exist");
const recoveryHandlerSource = recoveryGuidanceApp.slice(recoveryHandlerStart, recoveryHandlerEnd);
assert.ok(recoveryHandlerSource.includes("setPrompt(prompt)"), "Recovery guidance should prefill Command");
assert.ok(recoveryHandlerSource.includes("setMode(taskRecord?.mode"), "Recovery preparation should preserve the previous mode");
assert.ok(!/\bexecute\s*\(/.test(recoveryHandlerSource), "Recovery preparation must not submit the new objective automatically");



const retryAnalyticsServer = fs.readFileSync("server.py", "utf8");
const retryAnalyticsApp = fs.readFileSync("app.js", "utf8");
const retryAnalyticsCss = fs.readFileSync("styles.css", "utf8");
for (const field of [
  '"retry_outcomes": retry_outcomes',
  '"by_depth": [',
  '"eligible_after_failure": eligible_after_failure',
  '"recovered_after_failure": recovered_after_failure'
]) {
  assert.ok(retryAnalyticsServer.includes(field), "Missing analytics retry-recovery field: " + field);
}
for (const feature of [
  "const retryOutcomes=data?.retry_outcomes||{}",
  "Retry health",
  "RECOVERED AFTER FAILURE",
  "analytics-retry-stat-grid",
  "analytics-retry-depths",
  "recovery_rate"
]) {
  assert.ok(retryAnalyticsApp.includes(feature), "Missing retry-health analytics UI: " + feature);
}
for (const style of [
  ".analytics-retry-panel",
  ".analytics-retry-stat-grid",
  ".analytics-retry-depth-row",
  ".analytics-retry-track",
  "@media(max-width:620px)"
]) {
  assert.ok(retryAnalyticsCss.includes(style), "Missing retry analytics style: " + style);
}
assert.ok(fs.readFileSync("tests/test_analytics_api.py", "utf8").includes("test_analytics_measures_retry_outcomes_recovery_and_depth"), "Retry analytics calculations must have an API regression test");
console.log("Retry analytics smoke: aggregate metrics, depth breakdown, recovery UI and responsive layout OK");

const resetDemoBridge = fs.readFileSync("demo-bridge.js", "utf8");
const resetDemoApp = fs.readFileSync("app.js", "utf8");
const resetDemoCss = fs.readFileSync("styles.css", "utf8");
assert.ok(resetDemoBridge.includes('path === "/api/demo/reset"'), "Demo API should expose a local-only history reset route");
assert.ok(resetDemoBridge.includes("requestKeys.clear()"), "Demo reset must also clear idempotency entries");
assert.ok(resetDemoApp.includes("const clearDemoHistory=async()=>"), "Demo reset action must use an explicit UI handler");
assert.ok(resetDemoApp.includes("window.confirm('Clear all local browser demo tasks? This cannot be undone.')"), "Clearing demo records must ask for confirmation");
assert.ok(resetDemoApp.includes("No backend records were changed."), "Reset feedback must clarify its local scope");
assert.ok(resetDemoApp.includes("simulate timeout"), "Browser demo instructions should expose synthetic timeout recovery");
assert.ok(resetDemoBridge.includes("forcedTimeout"), "The local demo should expose a deterministic timeout path");
assert.ok(fs.readFileSync("tests/test_demo_bridge.js", "utf8").includes("Please simulate timeout in demo"), "Synthetic timeout recovery must have a contract regression test");
assert.ok(resetDemoCss.includes(".demo-mode-reset"), "Demo reset control must have visible and keyboard-focus styling");
assert.ok(fs.readFileSync("tests/test_demo_bridge.js", "utf8").includes("/api/demo/reset"), "Demo history reset must have an integration regression test");
console.log("Demo reset smoke: confirmation, local-only deletion, idempotency cleanup, metrics refresh, and accessible styling OK");
assert.ok(resetDemoBridge.includes('path === "/api/demo/export"'), "Demo API should expose a local session archive endpoint");
assert.ok(resetDemoBridge.includes('path === "/api/demo/import"'), "Demo API should expose bounded local archive restore");
assert.ok(resetDemoBridge.includes("1024 * 1024"), "Archive restore must cap payload size");
assert.ok(resetDemoBridge.includes("importedIds.has(task.task_id) || find(task.task_id)"), "Archive restore must reject duplicate task IDs atomically");
assert.ok(resetDemoBridge.includes("tasks.length + imported.length > 25"), "Archive restore must enforce local retention limits");
assert.ok(resetDemoBridge.includes("CYRUS_BROWSER_DEMO_ARCHIVE"), "Local archive must carry a versioned format identifier");
assert.ok(resetDemoBridge.includes("exporter.buildTaskReport(task)"), "Local archive must use the allowlisted task report exporter");
assert.ok(resetDemoApp.includes("const exportDemoHistory=async()=>"), "Local archive needs an explicit user-triggered download handler");
assert.ok(resetDemoApp.includes("EXPORT LOCAL HISTORY"), "Local archive must be available from the demo banner");
assert.ok(resetDemoApp.includes("const importDemoHistory=async event=>"), "Local archive restore must have a file import handler");
assert.ok(resetDemoApp.includes("IMPORT ARCHIVE"), "Local archive restore must be available from the demo banner");
assert.ok(resetDemoCss.includes(".demo-mode-export"), "Local archive control must be styled and keyboard visible");
assert.ok(resetDemoCss.includes(".demo-mode-import:focus-visible"), "Archive import must have a visible keyboard focus style");
assert.ok(fs.readFileSync("tests/test_demo_bridge.js", "utf8").includes("/api/demo/export"), "Local session archive must have a bridge regression test");
console.log("Demo archive smoke: local endpoint, report allowlist, download action, disclosure and styling OK");
const browserDemoGuide = fs.readFileSync("docs/BROWSER_DEMO.md", "utf8");
for (const behavior of [
  "?demo=1",
  "simulate failure",
  "simulate timeout",
  "EXPORT LOCAL HISTORY",
  "CYRUS_BROWSER_DEMO_ARCHIVE",
  "25 task records",
  "256 keys",
  "CLEAR LOCAL HISTORY",
  "IMPORT ARCHIVE",
  "/api/demo/import",
  "atomic"
]) {
  assert.ok(browserDemoGuide.includes(behavior), "Missing browser demo guide coverage: " + behavior);
}
assert.ok(fs.readFileSync("README.md", "utf8").includes("docs/BROWSER_DEMO.md"), "README must link the dedicated browser demo guide");
console.log("Browser demo docs smoke: opt-in, failure/timeout simulation, archive, caps, and reset documented OK");





