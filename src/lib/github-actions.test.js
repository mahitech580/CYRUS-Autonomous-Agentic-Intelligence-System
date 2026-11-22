import assert from "node:assert/strict";
import test from "node:test";
import { filterWorkflowRuns, getWorkflowRunStatus, normalizeWorkflowRuns, summarizeWorkflowRuns } from "./github-actions.js";
const run = (overrides = {}) => ({
  id: 101, name: "CYRUS checks", run_number: 986, status: "completed", conclusion: "success",
  event: "push", head_branch: "main", head_sha: "a".repeat(40),
  created_at: "2026-11-22T02:00:00Z", updated_at: "2026-11-22T02:02:00Z",
  html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/101",
  ...overrides,
});
test("normalizes public workflow runs and preserves repository totals", () => {
  const result = normalizeWorkflowRuns({ total_count: 2259, workflow_runs: [run()] });
  assert.equal(result.totalCount, 2259);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].id, 101);
  assert.equal(result.runs[0].name, "CYRUS checks");
  assert.equal(result.runs[0].status, "completed");
  assert.equal(result.runs[0].conclusion, "success");
  assert.equal(result.runs[0].branch, "main");
  assert.equal(result.runs[0].sha, "a".repeat(40));
});
test("rejects malformed envelopes and ignores unsafe or malformed records", () => {
  assert.throws(() => normalizeWorkflowRuns(null), TypeError);
  assert.throws(() => normalizeWorkflowRuns({ workflow_runs: "not-an-array" }), TypeError);
  const result = normalizeWorkflowRuns({ total_count: 3, workflow_runs: [
    run(), run({id:102,html_url:"https://github.com.evil.example/actions/runs/102"}),
    run({id:"not-a-number"}), run({id:103,html_url:"javascript:alert(1)"}), null,
  ]});
  assert.equal(result.totalCount, 3);
  assert.deepEqual(result.runs.map((item) => item.id), [101]);
});
test("sorts newest first and enforces a bounded page size", () => {
  const older=run({id:102,run_number:985,created_at:"2026-11-20T02:00:00Z",html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/102"});
  const newer=run({id:103,run_number:987,created_at:"2026-11-23T02:00:00Z",html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/103"});
  assert.deepEqual(normalizeWorkflowRuns({total_count:2,workflow_runs:[older,newer]},1).runs.map(x=>x.id),[103]);
  assert.equal(normalizeWorkflowRuns({workflow_runs:[older,newer]},100).runs.length,2);
});
test("maps completed conclusions and leaves unknown statuses explicit", () => {
  assert.equal(getWorkflowRunStatus({status:"in_progress"}),"in_progress");
  assert.equal(getWorkflowRunStatus({status:"completed",conclusion:"failure"}),"failure");
  assert.equal(getWorkflowRunStatus({status:"completed",conclusion:null}),"completed");
  assert.equal(getWorkflowRunStatus({status:"unexpected"}),"unknown");
});
test("search and status filters operate on normalized workflow metadata", () => {
  const data=normalizeWorkflowRuns({workflow_runs:[
    run(),
    run({id:102,status:"in_progress",conclusion:null,head_branch:"feature/queue",run_number:987,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/102"}),
    run({id:103,conclusion:"failure",run_number:988,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/103"}),
  ]}).runs;
  assert.deepEqual(filterWorkflowRuns(data,"main push","success").map(x=>x.id),[101]);
  assert.deepEqual(filterWorkflowRuns(data,"feature queue","in_progress").map(x=>x.id),[102]);
  assert.deepEqual(filterWorkflowRuns(data,"","failure").map(x=>x.id),[103]);
  assert.deepEqual(filterWorkflowRuns(data,"not-present"),[]);
});
test("summarizes only the supplied recent window and keeps other states explicit", () => {
  assert.deepEqual(summarizeWorkflowRuns([
    {status:"in_progress"},{status:"queued"},{status:"completed",conclusion:"success"},
    {status:"completed",conclusion:"failure"},{status:"completed",conclusion:"timed_out"},
    {status:"completed",conclusion:"cancelled"},{status:"waiting"},
  ]),{inProgress:1,queued:1,successful:1,failed:2,cancelled:1,other:1});
});
