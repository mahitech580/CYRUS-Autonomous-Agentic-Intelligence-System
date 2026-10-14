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

  const api = Object.freeze({ buildTaskReport, downloadTaskReport });
  root.CYRUS_TASK_EXPORT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
