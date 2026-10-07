const assert = require("node:assert/strict");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
for (const asset of ["./styles.css", "./demo-bridge.js", "./app.js"]) {
  assert.ok(index.includes('src="' + asset + '"') || index.includes('href="' + asset + '"'), "Missing asset reference: " + asset);
  const path = asset.slice(2);
  assert.ok(fs.existsSync(path), "Missing referenced asset: " + path);
}

assert.ok(index.includes('type="text/babel"'), "React JSX entry must use the Babel loader");
assert.ok(fs.readFileSync("app.js", "utf8").includes("healthMetrics"), "Bootstrap must consume runtime metrics");
console.log("deployment smoke: index assets and bootstrap contract OK");
