const assert = require('node:assert/strict');
const test = require('node:test');
const reportApi = require('../task-export.js');

function task(overrides = {}) {
  return {task_id: 'BOUNDARY-1', objective: 'boundary test objective', ...overrides};
}


test("rejects null task record", () => {
  assert.throws(() => reportApi.buildTaskReport(null), TypeError);
});

test("rejects array task record", () => {
  assert.throws(() => reportApi.buildTaskReport([]), TypeError);
});

test("rejects task without identifier", () => {
  assert.throws(() => reportApi.buildTaskReport({objective: 'missing id'}), TypeError);
});

test("rejects whitespace task identifier", () => {
  assert.throws(() => reportApi.buildTaskReport(task({task_id: '   '})), TypeError);
});

test("omits unallowlisted root fields", () => {
  const report = reportApi.buildTaskReport(task({internal_debug_dump: 'must not be exported'}));
    assert.equal(report.task.internal_debug_dump, undefined);
});

test("omits case insensitive secret field names", () => {
  const report = reportApi.buildTaskReport(task({API_KEY: 'hidden', Authorization: 'hidden', objective: 'normal'}));
    assert.equal(report.task.API_KEY, undefined);
    assert.equal(report.task.Authorization, undefined);
});

test("recursively omits secret fields inside arrays", () => {
  const report = reportApi.buildTaskReport(task({events: [{message: 'started', access_token: 'hidden'}, [{password: 'hidden', status: 'ok'}]]}));
    assert.deepEqual(report.task.events, [{message: 'started'}, [{status: 'ok'}]]);
});

test("includes report schema and export timestamp", () => {
  const report = reportApi.buildTaskReport(task(), '2026-10-20T10:00:00.000Z');
    assert.equal(report.format, 'CYRUS_EXECUTION_REPORT');
    assert.equal(report.schema_version, 1);
    assert.equal(report.exported_at, '2026-10-20T10:00:00.000Z');
});

test("preserves unicode objective text", () => {
  const report = reportApi.buildTaskReport(task({objective: 'Analyze 東京, café, and 🚀 safely'}));
    assert.equal(report.task.objective, 'Analyze 東京, café, and 🚀 safely');
});

test("does not warn on ordinary engineering prose", () => {
  const report = reportApi.buildTaskReport(task({summary: 'Provider returned a timeout; retry after backoff.'}));
    assert.equal(report.sensitive_text_warnings.length, 0);
});

test("redacts provider style key from summary", () => {
  const secret = 'sk-' + 'a'.repeat(24);
    const report = reportApi.buildTaskReport(task({summary: 'Provider error: ' + secret}));
    assert.ok(!report.task.summary.includes(secret));
    assert.ok(report.task.summary.includes('[REDACTED:'));
});
