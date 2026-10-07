const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");

async function main() {
  const source = fs.readFileSync("demo-bridge.js", "utf8");
  const window = {
    fetch: async () => {
      throw new Error("offline");
    }
  };
  vm.runInNewContext(source, {
    window,
    Response,
    Date,
    JSON,
    String,
    Array,
    Promise,
    Math,
    Error,
    setTimeout,
    clearTimeout
  });

  let response = await window.fetch("/api/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).runtime, "browser-fallback");

  response = await window.fetch("/api/execute", {
    method: "POST",
    body: JSON.stringify({prompt: "Demo supervised flow", mode: "supervised"})
  });
  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(created.status, "AWAITING_APPROVAL");

  response = await window.fetch("/api/tasks/" + created.task_id);
  const pending = await response.json();
  assert.equal(pending.status, "AWAITING_APPROVAL");
  assert.equal(pending.approval_required, true);

  response = await window.fetch("/api/tasks/" + created.task_id + "/approve", {method: "POST"});
  assert.equal(response.status, 202);

  response = await window.fetch("/api/tasks/" + created.task_id);
  const completed = await response.json();
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.current_agent, "RELEASE");

  response = await window.fetch("/api/metrics");
  const metrics = await response.json();
  assert.equal(metrics.completed_tasks, 1);
  assert.equal(metrics.awaiting_approval, 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
