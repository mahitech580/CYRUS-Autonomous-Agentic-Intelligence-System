const assert = require("node:assert/strict");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
for (const asset of ["./styles.css", "./runtime-config.js", "./demo-bridge.js", "./event-stream.js", "./app.js"]) {
  assert.ok(index.includes('src="' + asset + '"') || index.includes('href="' + asset + '"'), "Missing asset reference: " + asset);
  const path = asset.slice(2);
  assert.ok(fs.existsSync(path), "Missing referenced asset: " + path);
}

assert.ok(index.includes('type="text/babel"'), "React JSX entry must use the Babel loader");
assert.ok(index.includes('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'), "The 3D character runtime must load Three.js before the app");
assert.ok(fs.readFileSync("app.js", "utf8").includes("healthMetrics"), "Bootstrap must consume runtime metrics");
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
