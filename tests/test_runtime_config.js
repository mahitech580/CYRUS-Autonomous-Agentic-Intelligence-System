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
  vm.runInNewContext(source, {window, URLSearchParams, URL});
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

const unsafeHttp = loadConfig({savedBase: "http://api.example.test"});
assert.equal(unsafeHttp.apiBaseUrl, DEFAULT_API_BASE_URL, "non-loopback HTTP must not receive API requests or keys");

const credentialUrl = loadConfig({savedBase: "https://operator:secret@api.example.test"});
assert.equal(credentialUrl.apiBaseUrl, DEFAULT_API_BASE_URL, "URLs with embedded credentials must be rejected");

const queryUrl = loadConfig({savedBase: "https://api.example.test/v1?token=should-not-persist"});
assert.equal(queryUrl.apiBaseUrl, DEFAULT_API_BASE_URL, "query strings must not be treated as an API base URL");

const fragmentUrl = loadConfig({savedBase: "https://api.example.test/v1#section"});
assert.equal(fragmentUrl.apiBaseUrl, DEFAULT_API_BASE_URL, "fragments must not be treated as an API base URL");

const scriptUrl = loadConfig({savedBase: "javascript:alert(1)"});
assert.equal(scriptUrl.apiBaseUrl, DEFAULT_API_BASE_URL, "non-HTTP URL schemes must fall back safely");

const localhost = loadConfig({savedBase: "http://localhost:8000/v1///"});
assert.equal(localhost.apiBaseUrl, "http://localhost:8000/v1", "local HTTP development and path normalization should remain supported");

const ipv6Loopback = loadConfig({savedBase: "http://[::1]:8000///"});
assert.equal(ipv6Loopback.apiBaseUrl, "http://[::1]:8000", "IPv6 loopback should remain supported for local development");

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
