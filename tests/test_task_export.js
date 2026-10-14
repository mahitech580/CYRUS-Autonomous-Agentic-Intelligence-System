const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTaskReport, downloadTaskReport } = require('../task-export.js');

test('builds a versioned report from an execution record', () => {
  const report = buildTaskReport({
    task_id: 'CYRUS-42',
    objective: 'Review an API boundary',
    status: 'COMPLETED',
    implementation: 'Draft output',
    events: [{ event_id: 'e1', phase: 'REVIEW', message: 'Reviewed' }],
    unknown_internal_field: 'must not be exported'
  }, '2026-10-14T06:00:00.000Z');

  assert.equal(report.format, 'CYRUS_EXECUTION_REPORT');
  assert.equal(report.schema_version, 1);
  assert.equal(report.exported_at, '2026-10-14T06:00:00.000Z');
  assert.equal(report.task.task_id, 'CYRUS-42');
  assert.equal(report.task.objective, 'Review an API boundary');
  assert.equal(report.task.events[0].event_id, 'e1');
  assert.equal('unknown_internal_field' in report.task, false);
  assert.match(report.notice, /Review it for sensitive content/);
});

test('omits credential-like fields at the root and inside nested trace data', () => {
  const report = buildTaskReport({
    task_id: 'CYRUS-SECURE',
    api_key: 'root-secret',
    authorization: 'Bearer root-secret',
    review: { summary: 'Pass', credentials: { password: 'secret' }, risk: 'LOW' },
    events: [{ message: 'Completed', private_key: 'secret-material', phase: 'REVIEW' }]
  });

  assert.equal('api_key' in report.task, false);
  assert.equal('authorization' in report.task, false);
  assert.equal('credentials' in report.task.review, false);
  assert.equal(report.task.review.risk, 'LOW');
  assert.equal('private_key' in report.task.events[0], false);
  assert.equal(report.task.events[0].message, 'Completed');
});

test('rejects empty or malformed task records', () => {
  assert.throws(() => buildTaskReport(null), /task_id/);
  assert.throws(() => buildTaskReport({ objective: 'Missing id' }), /task_id/);
  assert.throws(() => buildTaskReport([]), /task_id/);
});

test('downloads a JSON blob with a filesystem-safe task filename', () => {
  let savedBlob;
  let clicked = false;
  let removed = false;
  let appended = false;
  let revoked = null;
  const link = {
    style: {},
    click() { clicked = true; },
    remove() { removed = true; }
  };
  const documentRef = {
    body: { appendChild(node) { appended = node === link; } },
    createElement(tag) { assert.equal(tag, 'a'); return link; }
  };
  const urlApi = {
    createObjectURL(blob) { savedBlob = blob; return 'blob:report'; },
    revokeObjectURL(url) { revoked = url; }
  };
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.options = options; }
  }
  const root = { setTimeout(callback) { callback(); } };
  const report = downloadTaskReport(
    { task_id: '../../CYRUS 42', objective: 'Export test' },
    documentRef,
    urlApi,
    FakeBlob
  );

  assert.equal(link.download, 'cyrus-CYRUS-42-report.json');
  assert.equal(link.href, 'blob:report');
  assert.equal(savedBlob.options.type, 'application/json;charset=utf-8');
  assert.equal(JSON.parse(savedBlob.parts[0]).task.task_id, '../../CYRUS 42');
  assert.equal(report.format, 'CYRUS_EXECUTION_REPORT');
  assert.ok(clicked && removed && appended);
  assert.equal(revoked, 'blob:report');
});
