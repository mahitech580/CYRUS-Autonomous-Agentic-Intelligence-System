(function attachCyrusTaskExport(root) {
  const INCLUDED_FIELDS = [
    'task_id', 'objective', 'status', 'mode', 'current_agent',
    'created_at', 'started_at', 'completed_at', 'updated_at',
    'execution_time_ms', 'latency_ms', 'score', 'quality', 'confidence',
    'coverage', 'tool_calls', 'tests_passed', 'tests_failed', 'risk',
    'verification_status', 'summary', 'error', 'provider', 'model',
    'agents', 'plan', 'research', 'implementation', 'validation_plan',
    'static_analysis', 'review', 'artifacts', 'events', 'score_method'
  ];
  const SENSITIVE_FIELD = /(?:password|secret|token|authorization|api[_-]?key|private[_-]?key|cookie|credential)/i;

  function redactSensitiveFields(value) {
    if (Array.isArray(value)) return value.map(redactSensitiveFields);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELD.test(key))
        .map(([key, item]) => [key, redactSensitiveFields(item)])
    );
  }

  const SENSITIVE_TEXT_PATTERNS = [
    ['provider key-like value', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['AWS access-key-like value', /\bAKIA[0-9A-Z]{16}\b/],
    ['private-key header', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['bearer-token-like value', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/i]
  ];

  function findSensitiveText(value, path = '', warnings = []) {
    if (typeof value === 'string') {
      const matches = SENSITIVE_TEXT_PATTERNS
        .filter(([, pattern]) => pattern.test(value))
        .map(([label]) => label);
      if (matches.length) warnings.push({ path: path || '
    if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.task_id !== 'string' || !task.task_id.trim()) {
      throw new TypeError('A task record with a task_id is required to create a CYRUS report.');
    }
    const snapshot = {};
    for (const field of INCLUDED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(task, field)) {
        snapshot[field] = redactSensitiveFields(task[field]);
      }
    }
    const sensitiveTextWarnings = findSensitiveText(snapshot);
    return {
      format: 'CYRUS_EXECUTION_REPORT',
      schema_version: 1,
      exported_at: exportedAt,
      notice: 'Credential-like fields are omitted. Free-text matches are reported below but are not automatically removed; inspect the report before sharing.',
      sensitive_text_warnings: sensitiveTextWarnings,
      task: snapshot
    };
  }

  function safeFilePart(value) {
    return String(value || 'execution')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'execution';
  }

  function downloadTaskReport(task, documentRef = root.document, urlApi = root.URL, BlobCtor = root.Blob, schedule = root.setTimeout) {
    const report = buildTaskReport(task);
    if (!documentRef || !documentRef.body || !documentRef.createElement ||
        !urlApi || !urlApi.createObjectURL || !urlApi.revokeObjectURL || !BlobCtor) {
      throw new Error('This browser does not support JSON report downloads.');
    }
    const blob = new BlobCtor([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = urlApi.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = objectUrl;
    link.download = 'cyrus-' + safeFilePart(task.task_id) + '-report.json';
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    if (typeof schedule === 'function') {
      schedule(() => urlApi.revokeObjectURL(objectUrl), 1000);
    } else {
      urlApi.revokeObjectURL(objectUrl);
    }
    return report;
  }


  function markdownCell(value) {
    return String(value == null ? '' : value)
      .replace(/\r?\n/g, '<br>')
      .replace(/\|/g, '\\|');
  }

  function markdownList(items) {
    if (!Array.isArray(items) || !items.length) return '_None recorded._';
    return items.map((item, index) => {
      const label = typeof item === 'string' ? item : JSON.stringify(item);
      return (index + 1) + '. ' + markdownCell(label);
    }).join('\n');
  }

  function markdownFence(source) {
    const tick = String.fromCharCode(96);
    const matches = String(source || '').match(new RegExp(tick + '+', 'g')) || [];
    const longest = matches.reduce((max, token) => Math.max(max, token.length), 0);
    return tick.repeat(Math.max(3, longest + 1));
  }

  function buildTaskMarkdownReport(task, exportedAt = new Date().toISOString()) {
    const report = buildTaskReport(task, exportedAt);
    const record = report.task;
    const lines = [
      '# CYRUS Execution Report',
      '',
      '- **Task ID:** ' + markdownCell(record.task_id),
      '- **Status:** ' + markdownCell(record.status || 'UNKNOWN'),
      '- **Mode:** ' + markdownCell(record.mode || 'unspecified'),
      '- **Exported at:** ' + markdownCell(report.exported_at),
      '- **Created at:** ' + markdownCell(record.created_at || 'unknown'),
      '- **Duration:** ' + markdownCell(record.execution_time_ms == null ? 'unknown' : record.execution_time_ms + ' ms'),
      '',
      '> ' + report.notice,
      '',
      '## Objective',
      '',
      String(record.objective || 'No objective was recorded.').replace(/^/gm, '> '),
      '',
      '## Outcome',
      '',
      record.summary ? String(record.summary).replace(/^/gm, '> ') : '_No outcome summary was recorded._',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      '| Score | ' + markdownCell(record.score ?? '—') + ' |',
      '| Quality | ' + markdownCell(record.quality ?? '—') + ' |',
      '| Confidence | ' + markdownCell(record.confidence ?? '—') + ' |',
      '| Coverage | ' + markdownCell(record.coverage ?? '—') + ' |',
      '| Tool calls | ' + markdownCell(record.tool_calls ?? '—') + ' |',
      '| Verification | ' + markdownCell(record.verification_status || 'not reported') + ' |',
      '',
      '## Agent stages',
      '',
      Array.isArray(record.agents) && record.agents.length
        ? '| Agent | Status | Detail |\n| --- | --- | --- |\n' + record.agents.map(agent =>
            '| ' + markdownCell(agent.name || agent.agent || 'unknown') + ' | ' +
            markdownCell(agent.status || 'unknown') + ' | ' +
            markdownCell(agent.message || agent.summary || agent.error || '') + ' |'
          ).join('\n')
        : '_No stage snapshots were recorded._',
      '',
      '## Plan',
      '',
      markdownList(record.plan),
      '',
      '## Static analysis',
      '',
      Array.isArray(record.static_analysis?.checks) && record.static_analysis.checks.length
        ? '| Check | Status | Detail |\n| --- | --- | --- |\n' + record.static_analysis.checks.map(check =>
            '| ' + markdownCell(check.name || 'unnamed check') + ' | ' +
            markdownCell(check.status || 'unknown') + ' | ' +
            markdownCell(check.detail || '') + ' |'
          ).join('\n')
        : '_No static-analysis checks were recorded._',
      '',
      '## Artifacts',
      '',
      Array.isArray(record.artifacts) && record.artifacts.length
        ? '| Name | Type | Language | Size |\n| --- | --- | --- | --- |\n' + record.artifacts.map(item =>
            '| ' + markdownCell(item.name || 'unnamed') + ' | ' +
            markdownCell(item.type || '') + ' | ' +
            markdownCell(item.language || '') + ' | ' +
            markdownCell(item.size ?? '') + ' |'
          ).join('\n')
        : '_No artifacts were recorded._',
      '',
      '## Execution trace',
      '',
      Array.isArray(record.events) && record.events.length
        ? '| Time | Agent | Phase | Event | Duration (ms) |\n| --- | --- | --- | --- | ---: |\n' + record.events.map(event =>
            '| ' + markdownCell(event.time || event.timestamp || '') + ' | ' +
            markdownCell(event.agent || '') + ' | ' +
            markdownCell(event.phase || '') + ' | ' +
            markdownCell(event.message || '') + ' | ' +
            markdownCell(event.duration ?? '') + ' |'
          ).join('\n')
        : '_No execution trace was recorded._'
    ];

    if (record.implementation) {
      const fence = markdownFence(record.implementation);
      lines.push('', '## Implementation draft', '', fence, String(record.implementation), fence);
    }
    if (Array.isArray(record.validation_plan) && record.validation_plan.length) {
      lines.push('', '## Proposed validation plan', '', markdownList(record.validation_plan),
        '', '_These are proposed checks. This report does not imply the checks were executed._');
    }
    if (record.review?.summary || record.review?.findings?.length) {
      lines.push('', '## Review', '', String(record.review.summary || 'No review summary.').replace(/^/gm, '> '));
      if (Array.isArray(record.review.findings) && record.review.findings.length) {
        lines.push('', markdownList(record.review.findings));
      }
    }
    lines.push('', '---', '', 'Generated by CYRUS. Review generated content and traces before sharing.', '');
    return lines.join('\n');
  }

  function downloadTaskMarkdownReport(task, documentRef = root.document, urlApi = root.URL, BlobCtor = root.Blob, schedule = root.setTimeout) {
    const markdown = buildTaskMarkdownReport(task);
    if (!documentRef || !documentRef.body || !documentRef.createElement ||
        !urlApi || !urlApi.createObjectURL || !urlApi.revokeObjectURL || !BlobCtor) {
      throw new Error('This browser does not support report downloads.');
    }
    const objectUrl = urlApi.createObjectURL(new BlobCtor([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = documentRef.createElement('a');
    link.href = objectUrl;
    link.download = 'cyrus-' + safeFilePart(task.task_id) + '-report.md';
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    if (typeof schedule === 'function') schedule(() => urlApi.revokeObjectURL(objectUrl), 1000);
    else urlApi.revokeObjectURL(objectUrl);
    return markdown;
  }

  const api = Object.freeze({ buildTaskReport, downloadTaskReport, buildTaskMarkdownReport, downloadTaskMarkdownReport });
  root.CYRUS_TASK_EXPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
, patterns: matches });
      return warnings;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => findSensitiveText(item, path + '[' + index + ']', warnings));
      return warnings;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        findSensitiveText(item, path ? path + '.' + key : key, warnings);
      });
    }
    return warnings;
  }

  function buildTaskReport(task, exportedAt = new Date().toISOString()) {
    if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.task_id !== 'string' || !task.task_id.trim()) {
      throw new TypeError('A task record with a task_id is required to create a CYRUS report.');
    }
    const snapshot = {};
    for (const field of INCLUDED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(task, field)) {
        snapshot[field] = redactSensitiveFields(task[field]);
      }
    }
    return {
      format: 'CYRUS_EXECUTION_REPORT',
      schema_version: 1,
      exported_at: exportedAt,
      notice: 'This report can contain objectives, generated drafts and execution traces. Review it for sensitive content before sharing.',
      task: snapshot
    };
  }

  function safeFilePart(value) {
    return String(value || 'execution')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'execution';
  }

  function downloadTaskReport(task, documentRef = root.document, urlApi = root.URL, BlobCtor = root.Blob, schedule = root.setTimeout) {
    const report = buildTaskReport(task);
    if (!documentRef || !documentRef.body || !documentRef.createElement ||
        !urlApi || !urlApi.createObjectURL || !urlApi.revokeObjectURL || !BlobCtor) {
      throw new Error('This browser does not support JSON report downloads.');
    }
    const blob = new BlobCtor([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = urlApi.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = objectUrl;
    link.download = 'cyrus-' + safeFilePart(task.task_id) + '-report.json';
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    if (typeof schedule === 'function') {
      schedule(() => urlApi.revokeObjectURL(objectUrl), 1000);
    } else {
      urlApi.revokeObjectURL(objectUrl);
    }
    return report;
  }


  function markdownCell(value) {
    return String(value == null ? '' : value)
      .replace(/\r?\n/g, '<br>')
      .replace(/\|/g, '\\|');
  }

  function markdownList(items) {
    if (!Array.isArray(items) || !items.length) return '_None recorded._';
    return items.map((item, index) => {
      const label = typeof item === 'string' ? item : JSON.stringify(item);
      return (index + 1) + '. ' + markdownCell(label);
    }).join('\n');
  }

  function markdownFence(source) {
    const tick = String.fromCharCode(96);
    const matches = String(source || '').match(new RegExp(tick + '+', 'g')) || [];
    const longest = matches.reduce((max, token) => Math.max(max, token.length), 0);
    return tick.repeat(Math.max(3, longest + 1));
  }

  function buildTaskMarkdownReport(task, exportedAt = new Date().toISOString()) {
    const report = buildTaskReport(task, exportedAt);
    const record = report.task;
    const lines = [
      '# CYRUS Execution Report',
      '',
      '- **Task ID:** ' + markdownCell(record.task_id),
      '- **Status:** ' + markdownCell(record.status || 'UNKNOWN'),
      '- **Mode:** ' + markdownCell(record.mode || 'unspecified'),
      '- **Exported at:** ' + markdownCell(report.exported_at),
      '- **Created at:** ' + markdownCell(record.created_at || 'unknown'),
      '- **Duration:** ' + markdownCell(record.execution_time_ms == null ? 'unknown' : record.execution_time_ms + ' ms'),
      '',
      '> ' + report.notice,
      '',
      '## Objective',
      '',
      String(record.objective || 'No objective was recorded.').replace(/^/gm, '> '),
      '',
      '## Outcome',
      '',
      record.summary ? String(record.summary).replace(/^/gm, '> ') : '_No outcome summary was recorded._',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      '| Score | ' + markdownCell(record.score ?? '—') + ' |',
      '| Quality | ' + markdownCell(record.quality ?? '—') + ' |',
      '| Confidence | ' + markdownCell(record.confidence ?? '—') + ' |',
      '| Coverage | ' + markdownCell(record.coverage ?? '—') + ' |',
      '| Tool calls | ' + markdownCell(record.tool_calls ?? '—') + ' |',
      '| Verification | ' + markdownCell(record.verification_status || 'not reported') + ' |',
      '',
      '## Agent stages',
      '',
      Array.isArray(record.agents) && record.agents.length
        ? '| Agent | Status | Detail |\n| --- | --- | --- |\n' + record.agents.map(agent =>
            '| ' + markdownCell(agent.name || agent.agent || 'unknown') + ' | ' +
            markdownCell(agent.status || 'unknown') + ' | ' +
            markdownCell(agent.message || agent.summary || agent.error || '') + ' |'
          ).join('\n')
        : '_No stage snapshots were recorded._',
      '',
      '## Plan',
      '',
      markdownList(record.plan),
      '',
      '## Static analysis',
      '',
      Array.isArray(record.static_analysis?.checks) && record.static_analysis.checks.length
        ? '| Check | Status | Detail |\n| --- | --- | --- |\n' + record.static_analysis.checks.map(check =>
            '| ' + markdownCell(check.name || 'unnamed check') + ' | ' +
            markdownCell(check.status || 'unknown') + ' | ' +
            markdownCell(check.detail || '') + ' |'
          ).join('\n')
        : '_No static-analysis checks were recorded._',
      '',
      '## Artifacts',
      '',
      Array.isArray(record.artifacts) && record.artifacts.length
        ? '| Name | Type | Language | Size |\n| --- | --- | --- | --- |\n' + record.artifacts.map(item =>
            '| ' + markdownCell(item.name || 'unnamed') + ' | ' +
            markdownCell(item.type || '') + ' | ' +
            markdownCell(item.language || '') + ' | ' +
            markdownCell(item.size ?? '') + ' |'
          ).join('\n')
        : '_No artifacts were recorded._',
      '',
      '## Execution trace',
      '',
      Array.isArray(record.events) && record.events.length
        ? '| Time | Agent | Phase | Event | Duration (ms) |\n| --- | --- | --- | --- | ---: |\n' + record.events.map(event =>
            '| ' + markdownCell(event.time || event.timestamp || '') + ' | ' +
            markdownCell(event.agent || '') + ' | ' +
            markdownCell(event.phase || '') + ' | ' +
            markdownCell(event.message || '') + ' | ' +
            markdownCell(event.duration ?? '') + ' |'
          ).join('\n')
        : '_No execution trace was recorded._'
    ];

    if (record.implementation) {
      const fence = markdownFence(record.implementation);
      lines.push('', '## Implementation draft', '', fence, String(record.implementation), fence);
    }
    if (Array.isArray(record.validation_plan) && record.validation_plan.length) {
      lines.push('', '## Proposed validation plan', '', markdownList(record.validation_plan),
        '', '_These are proposed checks. This report does not imply the checks were executed._');
    }
    if (record.review?.summary || record.review?.findings?.length) {
      lines.push('', '## Review', '', String(record.review.summary || 'No review summary.').replace(/^/gm, '> '));
      if (Array.isArray(record.review.findings) && record.review.findings.length) {
        lines.push('', markdownList(record.review.findings));
      }
    }
    lines.push('', '---', '', 'Generated by CYRUS. Review generated content and traces before sharing.', '');
    return lines.join('\n');
  }

  function downloadTaskMarkdownReport(task, documentRef = root.document, urlApi = root.URL, BlobCtor = root.Blob, schedule = root.setTimeout) {
    const markdown = buildTaskMarkdownReport(task);
    if (!documentRef || !documentRef.body || !documentRef.createElement ||
        !urlApi || !urlApi.createObjectURL || !urlApi.revokeObjectURL || !BlobCtor) {
      throw new Error('This browser does not support report downloads.');
    }
    const objectUrl = urlApi.createObjectURL(new BlobCtor([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = documentRef.createElement('a');
    link.href = objectUrl;
    link.download = 'cyrus-' + safeFilePart(task.task_id) + '-report.md';
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    if (typeof schedule === 'function') schedule(() => urlApi.revokeObjectURL(objectUrl), 1000);
    else urlApi.revokeObjectURL(objectUrl);
    return markdown;
  }

  const api = Object.freeze({ buildTaskReport, downloadTaskReport, buildTaskMarkdownReport, downloadTaskMarkdownReport });
  root.CYRUS_TASK_EXPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
