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
