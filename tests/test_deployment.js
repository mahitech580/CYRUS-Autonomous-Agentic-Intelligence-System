const assert = require("node:assert/strict");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
for (const asset of ["./styles.css", "./demo-bridge.js", "./event-stream.js", "./app.js"]) {
  assert.ok(index.includes('src="' + asset + '"') || index.includes('href="' + asset + '"'), "Missing asset reference: " + asset);
  const path = asset.slice(2);
  assert.ok(fs.existsSync(path), "Missing referenced asset: " + path);
}

assert.ok(index.includes('type="text/babel"'), "React JSX entry must use the Babel loader");
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
for (const feature of ["function PageHero","page-agents","registry-grid","page-memory","memory-gallery","page-tools","tool-library","04 / EXECUTION HISTORY","CYRUS_IMAGES","images.unsplash.com"]) {
  assert.ok(refreshedApp.includes(feature), "Missing visual redesign feature: " + feature);
}
const refreshedCss = fs.readFileSync("styles.css", "utf8");
for (const style of ["--trip-green:#2fbb78","--trip-red:#b83d35",".editorial-hero",".page-stat-rail",".registry-grid",".tool-category-grid",".memory-gallery","prefers-reduced-motion:reduce"]) {
  assert.ok(refreshedCss.includes(style), "Missing TripPilot-inspired style: " + style);
}
