const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTaskReport, downloadTaskReport, buildTaskMarkdownReport, downloadTaskMarkdownReport, copyTaskMarkdownReport, copyTaskJsonReport, buildTaskCsvReport, downloadTaskCsvReport } = require('../task-export.js');

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
  assert.match(report.notice, /redacted heuristically/);
  assert.match(report.notice, /detection is not exhaustive/);
});

test('preserves retry lineage across JSON, Markdown and CSV exports', () => {
  const task = {
    task_id: 'CYRUS-RETRY-002',
    objective: 'Retry a timed-out execution',
    status: 'RUNNING',
    parent_task_id: 'CYRUS-RETRY-001',
    retry_number: 2,
    retry_reason: 'TIMED_OUT:TaskTimedOut',
    max_task_retries: 3,
    effective_max_task_retries: 2,
    retry_lineage: [
      { task_id: 'CYRUS-RETRY-001', status: 'TIMED_OUT', retry_number: 0 },
      { task_id: 'CYRUS-RETRY-002', status: 'RUNNING', parent_task_id: 'CYRUS-RETRY-001', retry_number: 2, retry_reason: 'TIMED_OUT:TaskTimedOut' }
    ],
    recovery_guidance: {
      category: 'timeout',
      recommended_action: 'reduce_scope_and_inspect_trace',
      status: 'TIMED_OUT',
      headline: 'The execution deadline was reached.',
      explanation: 'The runtime stopped at its configured deadline.',
      steps: ['Reduce the objective.', 'Inspect the last completed stage.'],
      retry_guidance: 'Retry explicitly only when safe.',
      synthetic_demo: false
    }
  };
  const json = buildTaskReport(task);
  assert.equal(json.task.parent_task_id, 'CYRUS-RETRY-001');
  assert.equal(json.task.retry_number, 2);
  assert.equal(json.task.retry_reason, 'TIMED_OUT:TaskTimedOut');
  assert.equal(json.task.max_task_retries, 3);
  assert.equal(json.task.effective_max_task_retries, 2);
  assert.equal(json.task.retry_lineage.length, 2);
  assert.equal(json.task.retry_lineage[1].parent_task_id, 'CYRUS-RETRY-001');
  assert.equal(json.task.recovery_guidance.category, 'timeout');
  assert.equal(json.task.recovery_guidance.recommended_action, 'reduce_scope_and_inspect_trace');
  assert.equal(json.task.recovery_guidance.steps.length, 2);

  const markdown = buildTaskMarkdownReport(task);
  assert.match(markdown, /Retry of:\*\* CYRUS-RETRY-001/);
  assert.match(markdown, /Retry attempt:\*\* 2/);
  assert.match(markdown, /Retry reason:\*\* TIMED_OUT:TaskTimedOut/);
  assert.match(markdown, /Effective retry cap:\*\* 2/);
  assert.match(markdown, /## Retry lineage/);
  assert.match(markdown, /CYRUS-RETRY-001.*TIMED_OUT/);
  assert.match(markdown, /CYRUS-RETRY-002.*RUNNING/);
  assert.match(markdown, /## Recovery guidance/);
  assert.match(markdown, /Recommended action:\*\* reduce_scope_and_inspect_trace/);
  assert.match(markdown, /The execution deadline was reached/);
  assert.match(markdown, /Inspect the last completed stage/);

  const csv = buildTaskCsvReport(task);
  assert.ok(csv.includes('Retry source task,CYRUS-RETRY-001\r\n'));
  assert.ok(csv.includes('Retry number,2\r\n'));
  assert.ok(csv.includes('Retry reason,TIMED_OUT:TaskTimedOut\r\n'));
  assert.ok(csv.includes('Retry limit,3\r\n'));
  assert.ok(csv.includes('Effective retry limit,2\r\n'));
  assert.ok(csv.includes('Retry lineage,'));
  assert.ok(csv.includes('CYRUS-RETRY-001'));
  assert.ok(csv.includes('CYRUS-RETRY-002'));
  assert.ok(csv.includes('Recovery guidance,'));
  assert.ok(csv.includes('The execution deadline was reached'));
});

test('redacts sensitive keys inside attached recovery guidance', () => {
  const report = buildTaskReport({
    task_id: 'CYRUS-RECOVERY-SAFE',
    status: 'FAILED',
    recovery_guidance: {
      category: 'provider_configuration',
      headline: 'Configuration issue',
      steps: ['Check backend configuration.'],
      api_key: 'guidance-secret-sentinel',
      authorization: 'Bearer guidance-secret-sentinel',
      nested: {credential: 'guidance-secret-sentinel', safe_label: 'configuration'}
    }
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.task.recovery_guidance.category, 'provider_configuration');
  assert.ok(!serialized.includes('guidance-secret-sentinel'));
  assert.ok(!Object.hasOwn(report.task.recovery_guidance, 'api_key'));
  assert.ok(!Object.hasOwn(report.task.recovery_guidance.nested, 'credential'));
  assert.equal(report.task.recovery_guidance.nested.safe_label, 'configuration');
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
    FakeBlob,
    callback => callback()
  );

  assert.equal(link.download, 'cyrus-CYRUS-42-report.json');
  assert.equal(link.href, 'blob:report');
  assert.equal(savedBlob.options.type, 'application/json;charset=utf-8');
  assert.equal(JSON.parse(savedBlob.parts[0]).task.task_id, '../../CYRUS 42');
  assert.equal(report.format, 'CYRUS_EXECUTION_REPORT');
  assert.ok(clicked && removed && appended);
  assert.equal(revoked, 'blob:report');
});


test('builds a readable Markdown report with metrics and trace sections', () => {
  const report = buildTaskMarkdownReport({
    task_id: 'CYRUS-MD-1',
    objective: 'Review the deployment boundary',
    status: 'COMPLETED',
    score: 0,
    summary: 'Review completed.',
    agents: [{ name: 'REVIEWER', status: 'COMPLETED', message: 'No blockers' }],
    events: [{ time: '10:00', agent: 'REVIEWER', phase: 'REVIEW', message: 'Reviewed record', duration: 12 }]
  }, '2026-10-14T06:00:00.000Z');

  assert.match(report, /^# CYRUS Execution Report/m);
  assert.match(report, /CYRUS-MD-1/);
  assert.match(report, /\| Score \| 0 \|/);
  assert.match(report, /## Agent stages/);
  assert.match(report, /## Execution trace/);
  assert.match(report, /No blockers/);
});

test('escapes Markdown table delimiters and preserves Unicode text', () => {
  const report = buildTaskMarkdownReport({
    task_id: 'CYRUS-MD-2',
    objective: 'Validate A | B — revisión 安全',
    events: [{ message: 'One | two', phase: 'TEST', agent: 'TESTER' }]
  });
  assert.match(report, /A \\| B/);
  assert.match(report, /revisión 安全/);
  assert.match(report, /One \\| two/);
});

test('uses a safe variable-length fence around generated implementation drafts', () => {
  const draft = 'Example code:\n```python\nprint("safe")\n```\n';
  const report = buildTaskMarkdownReport({ task_id: 'CYRUS-MD-3', implementation: draft });
  assert.match(report, /## Implementation draft/);
  assert.match(report, /````\nExample code:/);
  assert.match(report, /print\("safe"\)/);
});

test('downloads Markdown report with the correct MIME type and extension', () => {
  let savedBlob;
  let clicked = false;
  let revoked = false;
  const link = {
    style: {},
    click() { clicked = true; },
    remove() {}
  };
  const documentRef = {
    body: { appendChild(node) { assert.equal(node, link); } },
    createElement(tag) { assert.equal(tag, 'a'); return link; }
  };
  const urlApi = {
    createObjectURL(blob) { savedBlob = blob; return 'blob:markdown'; },
    revokeObjectURL(url) { revoked = url === 'blob:markdown'; }
  };
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.options = options; }
  }
  const markdown = downloadTaskMarkdownReport(
    { task_id: '../cy-rus report', objective: 'Markdown test' },
    documentRef,
    urlApi,
    FakeBlob,
    callback => callback()
  );

  assert.equal(link.download, 'cyrus-cy-rus-report-report.md');
  assert.equal(savedBlob.options.type, 'text/markdown;charset=utf-8');
  assert.equal(savedBlob.parts[0], markdown);
  assert.ok(clicked && revoked);
});


test('detects secret-like text without copying the matched value into warnings', () => {
  const secret = 'sk-' + 'abcdefghijklmnopqrstuvwxyz123456';
  const report = buildTaskReport({
    task_id: 'CYRUS-SECRET-WARN',
    objective: 'Inspect this value: ' + secret,
    implementation: 'No secrets should be printed here.'
  });
  assert.ok(report.sensitive_text_warnings.some(item => item.path === 'objective'));
  assert.ok(report.sensitive_text_warnings.some(item => item.patterns.includes('provider key-like value')));
  assert.equal(JSON.stringify(report.sensitive_text_warnings).includes(secret), false);
  assert.equal(report.task.objective.includes(secret), false);
  assert.match(report.task.objective, /REDACTED: provider key-like value/);
});

test('finds nested key-like values in event strings and private key headers', () => {
  const report = buildTaskReport({
    task_id: 'CYRUS-SECRET-NESTED',
    events: [{ message: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789' }],
    implementation: '-----BEGIN PRIVATE KEY-----'
  });
  assert.ok(report.sensitive_text_warnings.some(item => item.path === 'events[0].message'));
  assert.ok(report.sensitive_text_warnings.some(item => item.path === 'implementation'));
  assert.ok(report.sensitive_text_warnings.every(item => !('value' in item)));
});

test('does not warn on ordinary engineering prose', () => {
  const report = buildTaskReport({
    task_id: 'CYRUS-NO-SECRET',
    objective: 'Create a REST API and verify project access permissions.',
    implementation: 'Use environment variables for configuration.'
  });
  assert.deepEqual(report.sensitive_text_warnings, []);
});

test('includes content safety warnings in the Markdown version', () => {
  const secret = 'AKIA' + '1234567890ABCDEF';
  const markdown = buildTaskMarkdownReport({
    task_id: 'CYRUS-MD-WARN',
    objective: 'Review ' + secret
  });
  assert.match(markdown, /## Content safety warnings/);
  assert.match(markdown, /objective/);
  assert.equal(markdown.includes(secret), false);
  assert.match(markdown, /REDACTED: AWS access-key-like value/);
  assert.match(markdown, /inspect the referenced fields before sharing/i);
});


test('redacts truncated private-key blocks through end of exported text', () => {
  const truncated = 'header\\n-----BEGIN PRIVATE KEY-----\\nprivate-material-that-must-not-escape';
  const report = buildTaskReport({
    task_id: 'CYRUS-TRUNCATED-PEM',
    implementation: truncated
  });
  const output = JSON.stringify(report);
  assert.equal(output.includes('private-material-that-must-not-escape'), false);
  assert.match(report.task.implementation, /REDACTED: private-key block/);
});

test('redacts encrypted private-key blocks even when truncated', () => {
  const encrypted = '-----BEGIN ENCRYPTED PRIVATE KEY-----\\nencrypted-material-that-must-not-escape';
  const report = buildTaskReport({
    task_id: 'CYRUS-ENCRYPTED-PEM',
    implementation: encrypted
  });
  const output = JSON.stringify(report);
  assert.equal(output.includes('encrypted-material-that-must-not-escape'), false);
  assert.match(report.task.implementation, /REDACTED: private-key block/);
});

test('redacts complete private-key blocks and bearer credentials from exported strings', () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nprivate-material-that-must-not-escape\n-----END PRIVATE KEY-----';
  const bearer = 'Bearer ' + 'abcDEF1234567890_tokenValue987654321';
  const report = buildTaskReport({
    task_id: 'CYRUS-REDACTION',
    implementation: privateKey,
    objective: 'Use ' + bearer
  });
  const exported = JSON.stringify(report);
  assert.equal(exported.includes('private-material-that-must-not-escape'), false);
  assert.equal(exported.includes(bearer), false);
  assert.match(report.task.implementation, /REDACTED: private-key block/);
  assert.match(report.task.objective, /REDACTED: bearer-token-like value/);
  assert.ok(report.sensitive_text_warnings.some(item => item.path === 'implementation'));
  assert.ok(report.sensitive_text_warnings.some(item => item.path === 'objective'));
});


test('copies the sanitized Markdown report and returns the copied text', async () => {
  let copied = '';
  const clipboard = { async writeText(value) { copied = value; } };
  const markdown = await copyTaskMarkdownReport({
    task_id: 'CYRUS-COPY',
    objective: 'Review the service boundary',
    score: 8
  }, clipboard);
  assert.equal(copied, markdown);
  assert.match(copied, /# CYRUS Execution Report/);
  assert.match(copied, /CYRUS-COPY/);
});

test('reports unsupported clipboard access without claiming a copy succeeded', async () => {
  await assert.rejects(
    () => copyTaskMarkdownReport({ task_id: 'CYRUS-NO-CLIP' }, null),
    /Clipboard access is unavailable/
  );
});

test('propagates clipboard write failure to the caller', async () => {
  const clipboard = { async writeText() { throw new Error('Permission denied'); } };
  await assert.rejects(
    () => copyTaskMarkdownReport({ task_id: 'CYRUS-CLIP-FAIL' }, clipboard),
    /Permission denied/
  );
});


test('redacts GitHub Google Slack and JWT-like values from exported text', () => {
  const values = [
    'ghp_' + 'A'.repeat(30),
    'AIza' + 'B'.repeat(35),
    'xoxb-' + 'C'.repeat(24),
    'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12)
  ];
  const report = buildTaskReport({
    task_id: 'CYRUS-MULTI-REDACTION',
    objective: values.join(' ')
  });
  const output = JSON.stringify(report);
  for (const value of values) {
    assert.equal(output.includes(value), false);
  }
  assert.match(report.task.objective, /REDACTED: GitHub token-like value/);
  assert.match(report.task.objective, /REDACTED: Google API key-like value/);
  assert.match(report.task.objective, /REDACTED: Slack token-like value/);
  assert.match(report.task.objective, /REDACTED: JWT-like value/);
  assert.ok(report.sensitive_text_warnings.flatMap(item => item.patterns).length >= 4);
});


test('copies the sanitized JSON report and preserves the report schema', async () => {
  let copied = '';
  const clipboard = { async writeText(value) { copied = value; } };
  const report = await copyTaskJsonReport({
    task_id: 'CYRUS-COPY-JSON',
    objective: 'Key-like value sk-' + 'abcdefghijklmnopqrstuvwxyz123456'
  }, clipboard);
  const parsed = JSON.parse(copied);
  assert.equal(parsed.format, 'CYRUS_EXECUTION_REPORT');
  assert.equal(parsed.task.task_id, 'CYRUS-COPY-JSON');
  assert.equal(parsed.task.objective.includes('sk-abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(parsed.task.objective.includes('REDACTED:'), true);
  assert.deepEqual(parsed, report);
});

test('JSON clipboard sharing reports unavailable permission cleanly', async () => {
  await assert.rejects(
    () => copyTaskJsonReport({ task_id: 'CYRUS-JSON-NO-CLIP' }, null),
    /Clipboard access is unavailable/
  );
});


test('builds a two-column CSV report and includes optional fields only when present', () => {
  const csv = buildTaskCsvReport({
    task_id: 'CYRUS-CSV-1',
    objective: 'Review the API',
    status: 'COMPLETED',
    score: 9,
    tests_passed: 4
  });
  assert.ok(csv.startsWith('\uFEFFField,Value\r\n'));
  assert.ok(csv.includes('Task ID,CYRUS-CSV-1\r\n'));
  assert.ok(csv.includes('Objective,Review the API\r\n'));
  assert.ok(csv.includes('Score,9\r\n'));
  assert.equal(csv.includes('Provider,'), false);
});

test('CSV report quotes multiline values and neutralizes formula-leading task content', () => {
  const csv = buildTaskCsvReport({
    task_id: 'CYRUS-CSV-2',
    objective: '=IMPORTXML("https://example.invalid","//token")',
    summary: 'Line one\nLine two'
  });
  assert.ok(csv.includes('"\'=IMPORTXML(""https://example.invalid"",""//token"")"'));
  assert.ok(csv.includes('"Line one\nLine two"'));
});

test('CSV report serializes nested fields safely and redacts known credential patterns', () => {
  const secret = 'ghp_' + 'Z'.repeat(30);
  const csv = buildTaskCsvReport({
    task_id: 'CYRUS-CSV-3',
    events: [{ message: secret, phase: 'REVIEW' }],
    summary: 'Inspect ' + secret
  });
  assert.equal(csv.includes(secret), false);
  assert.ok(csv.includes('REDACTED: GitHub token-like value'));
  assert.ok(csv.includes('Sensitive text warnings'));
});

test('downloads CSV report with correct file extension and MIME type', () => {
  let blob;
  let clicked = false;
  let revoked = false;
  const link = { style: {}, click() { clicked = true; }, remove() {} };
  const documentRef = {
    body: { appendChild(node) { assert.equal(node, link); } },
    createElement(tag) { assert.equal(tag, 'a'); return link; }
  };
  const urlApi = {
    createObjectURL(value) { blob = value; return 'blob:cyrus-csv'; },
    revokeObjectURL(value) { revoked = value === 'blob:cyrus-csv'; }
  };
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.options = options; }
  }
  const csv = downloadTaskCsvReport(
    { task_id: 'CYRUS CSV/4', objective: 'CSV download' },
    documentRef, urlApi, FakeBlob, callback => callback()
  );
  assert.equal(link.download, 'cyrus-CYRUS-CSV-4-report.csv');
  assert.equal(blob.options.type, 'text/csv;charset=utf-8;');
  assert.equal(blob.parts[0], csv);
  assert.ok(clicked && revoked);
});
