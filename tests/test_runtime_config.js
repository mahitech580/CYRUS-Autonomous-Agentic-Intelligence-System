const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("runtime-config.js", "utf8");
const DEFAULT_API_BASE_URL = "https://cyrus-agentic-api-mahitech580.onrender.com";

function loadConfig({search = "", savedBase = "", accessKey = "", blockStorage = false} = {}) {
  const data = new Map([
    ["cyrus-api-base-url", savedBase],
    ["cyrus-api-access-key", accessKey]
  ]);
  const storage = {
    getItem(key) {
      if (blockStorage) throw new Error("storage unavailable");
      return data.has(key) ? data.get(key) : null;
    }
  };
  const window = {
    location: {search},
    localStorage: storage,
    sessionStorage: storage
  };
  vm.runInNewContext(source, {window, URLSearchParams});
  return window.CYRUS_CONFIG;
}

const normal = loadConfig({accessKey: "  secret-for-test  "});
assert.equal(normal.apiBaseUrl, DEFAULT_API_BASE_URL);
assert.equal(normal.defaultApiBaseUrl, DEFAULT_API_BASE_URL);
assert.equal(normal.apiAccessKey, "secret-for-test");
assert.equal(normal.runtime, "remote-api");
assert.equal(normal.explicitDemoMode, false);

const overridden = loadConfig({
  savedBase: " https://api.example.test/v1/// ",
  accessKey: "tab-key"
});
assert.equal(overridden.apiBaseUrl, "https://api.example.test/v1");
assert.equal(overridden.apiAccessKey, "tab-key");
assert.equal(overridden.runtime, "remote-api");
assert.equal(overridden.explicitDemoMode, false);

const demo = loadConfig({
  search: "?demo=1",
  savedBase: "https://api.example.test/should-not-be-called",
  accessKey: "must-not-leak-to-demo"
});
assert.equal(demo.apiBaseUrl, "");
assert.equal(demo.apiAccessKey, "");
assert.equal(demo.runtime, "browser-demo");
assert.equal(demo.explicitDemoMode, true);

const notDemo = loadConfig({search: "?demo=true"});
assert.equal(notDemo.runtime, "remote-api");
assert.equal(notDemo.explicitDemoMode, false);

const privateMode = loadConfig({blockStorage: true});
assert.equal(privateMode.apiBaseUrl, DEFAULT_API_BASE_URL);
assert.equal(privateMode.apiAccessKey, "");
assert.equal(privateMode.runtime, "remote-api");

console.log("Runtime config contract: remote default, normalized override, explicit local demo, and blocked-storage fallback OK");
