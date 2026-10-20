const assert = require('node:assert/strict');
const test = require('node:test');
const reportApi = require('../task-export.js');

function task(overrides = {}) {
  return {task_id: 'BOUNDARY-1', objective: 'boundary test objective', ...overrides};
}

