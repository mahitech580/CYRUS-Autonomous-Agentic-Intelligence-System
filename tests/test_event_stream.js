const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("event-stream.js", "utf8");

function loadClient(fetchImpl) {
  const window = {fetch: fetchImpl};
  vm.runInNewContext(source, {
    window,
    TextDecoder,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    Error,
    Promise,
    Math,
    Number
  });
  return window.CyrusEventStream;
}

function sse(name, payload, id) {
  return (id ? "id: " + id + "\n" : "") +
    "event: " + name + "\n" +
    "data: " + JSON.stringify(payload) + "\n\n";
}

function makeResponse(text, status = 200, chunkSize = 13) {
  const encoder = new TextEncoder();
  let offset = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= text.length) {
        controller.close();
        return;
      }
      const chunk = text.slice(offset, offset + chunkSize);
      offset += chunk.length;
      controller.enqueue(encoder.encode(chunk));
    }
  });
  return new Response(stream, {status, headers: {"Content-Type": "text/event-stream"}});
}

async function testCompleteStreamParsesSplitFrames() {
  const seenStates = [];
  const seenTraces = [];
  let calls = 0;
  const client = loadClient(async () => {
    calls += 1;
    return makeResponse(
      sse("state", {task_id: "CYRUS-A", status: "RUNNING"}) +
      sse("trace", {event_id: "CYRUS-A-E001", agent: "PLANNER"}, "CYRUS-A-E001") +
      sse("close", {task_id: "CYRUS-A", status: "COMPLETED"})
    );
  });
  await client.streamTaskEvents("CYRUS-A", null, x => seenStates.push(x), x => seenTraces.push(x));
  assert.equal(calls, 1);
  assert.equal(seenStates[0].status, "RUNNING");
  assert.deepEqual(seenTraces.map(x => x.event_id), ["CYRUS-A-E001"]);
}

async function testReconnectResumesFromLastDeliveredTrace() {
  const requestHeaders = [];
  const seenTraces = [];
  let calls = 0;
  const client = loadClient(async (_url, init) => {
    requestHeaders.push({...init.headers});
    calls += 1;
    if (calls === 1) {
      return makeResponse(sse("trace", {event_id: "CYRUS-B-E001", agent: "PLANNER"}, "CYRUS-B-E001"));
    }
    return makeResponse(
      sse("trace", {event_id: "CYRUS-B-E002", agent: "CODER"}, "CYRUS-B-E002") +
      sse("close", {task_id: "CYRUS-B", status: "COMPLETED"})
    );
  });
  await client.streamTaskEvents(
    "CYRUS-B", null, () => {}, x => seenTraces.push(x),
    {baseDelayMs: 0, maxDelayMs: 0, maxReconnects: 2}
  );
  assert.equal(calls, 2);
  assert.equal(requestHeaders[0]["Last-Event-ID"], undefined);
  assert.equal(requestHeaders[1]["Last-Event-ID"], "CYRUS-B-E001");
  assert.deepEqual(seenTraces.map(x => x.event_id), ["CYRUS-B-E001", "CYRUS-B-E002"]);
}

async function testStreamLeaseTimeoutResumes() {
  const headers = [];
  let calls = 0;
  const seenTraces = [];
  const client = loadClient(async (_url, init) => {
    headers.push({...init.headers});
    calls += 1;
    if (calls === 1) {
      return makeResponse(
        sse("trace", {event_id: "CYRUS-C-E003", agent: "REVIEWER"}, "CYRUS-C-E003") +
        sse("close", {task_id: "CYRUS-C", status: "STREAM_TIMEOUT"})
      );
    }
    return makeResponse(sse("close", {task_id: "CYRUS-C", status: "COMPLETED"}));
  });
  await client.streamTaskEvents(
    "CYRUS-C", null, () => {}, x => seenTraces.push(x),
    {baseDelayMs: 0, maxDelayMs: 0, maxReconnects: 2}
  );
  assert.equal(calls, 2);
  assert.equal(headers[1]["Last-Event-ID"], "CYRUS-C-E003");
  assert.deepEqual(seenTraces.map(x => x.event_id), ["CYRUS-C-E003"]);
}

async function testAllStandardLineEndingsAcrossChunkBoundaries() {
  const states = [];
  const traces = [];
  const state = {task_id: "CYRUS-CR", status: "RUNNING"};
  const trace = {event_id: "CYRUS-CR-E001", agent: "PLANNER"};
  const close = {task_id: "CYRUS-CR", status: "COMPLETED"};
  const body =
    "event: state\r\ndata: " + JSON.stringify(state) + "\r\n\r\n" +
    "event: trace\rid: CYRUS-CR-E001\rdata: " + JSON.stringify(trace) + "\r\r" +
    "event: close\ndata: " + JSON.stringify(close) + "\n\n";
  let calls = 0;
  const client = loadClient(async () => {
    calls += 1;
    return makeResponse(body, 200, 1);
  });
  await client.streamTaskEvents(
    "CYRUS-CR", null, value => states.push(value), value => traces.push(value),
    {baseDelayMs: 0, maxDelayMs: 0, maxReconnects: 0}
  );
  assert.equal(calls, 1);
  assert.equal(states[0].task_id, "CYRUS-CR");
  assert.deepEqual(traces.map(value => value.event_id), ["CYRUS-CR-E001"]);
}

async function testTransientHttpFailureIsRetried() {
  let calls = 0;
  const client = loadClient(async () => {
    calls += 1;
    return calls === 1
      ? makeResponse("service unavailable", 503)
      : makeResponse(sse("close", {task_id: "CYRUS-D", status: "COMPLETED"}));
  });
  await client.streamTaskEvents(
    "CYRUS-D", null, () => {}, () => {},
    {baseDelayMs: 0, maxDelayMs: 0, maxReconnects: 1}
  );
  assert.equal(calls, 2);
}

async function main() {
  await testCompleteStreamParsesSplitFrames();
  await testReconnectResumesFromLastDeliveredTrace();
  await testStreamLeaseTimeoutResumes();
  await testAllStandardLineEndingsAcrossChunkBoundaries();
  await testTransientHttpFailureIsRetried();
  console.log("event-stream tests: parsing, reconnect resume, lease timeout and retry OK");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
