import assert from "node:assert/strict";
import test from "node:test";
import { filterWorkflowRuns, formatWorkflowDuration, getWorkflowRunStatus, getWorkflowRunsErrorMessage, normalizeWorkflowRuns, parseGitHubRetryAfter, summarizeWorkflowRuns } from "./github-actions.js";
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
test("calculates elapsed time only for completed runs with valid timestamps", () => {
  const completed = normalizeWorkflowRuns({ workflow_runs: [
    run({
      id: 301,
      run_started_at: "2026-11-22T02:00:00Z",
      updated_at: "2026-11-22T02:02:14Z",
      html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/301",
    }),
  ] }).runs[0];
  assert.equal(completed.elapsedSeconds, 134);

  const running = normalizeWorkflowRuns({ workflow_runs: [
    run({
      id: 302,
      status: "in_progress",
      conclusion: null,
      run_started_at: "2026-11-22T02:00:00Z",
      updated_at: "2026-11-22T02:02:14Z",
      html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/302",
    }),
  ] }).runs[0];
  assert.equal(running.elapsedSeconds, null);

  const invalidRange = normalizeWorkflowRuns({ workflow_runs: [
    run({
      id: 303,
      run_started_at: "2026-11-22T02:03:00Z",
      updated_at: "2026-11-22T02:02:00Z",
      html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/303",
    }),
  ] }).runs[0];
  assert.equal(invalidRange.elapsedSeconds, null);
  assert.equal(formatWorkflowDuration(0), "0s");
  assert.equal(formatWorkflowDuration(59), "59s");
  assert.equal(formatWorkflowDuration(60), "1m");
  assert.equal(formatWorkflowDuration(134), "2m 14s");
  assert.equal(formatWorkflowDuration(3600), "1h");
  assert.equal(formatWorkflowDuration(3660), "1h 1m");
  assert.equal(formatWorkflowDuration(-1), "");
  assert.equal(formatWorkflowDuration(1.5), "");
});

test("maps completed conclusions and leaves unknown statuses explicit", () => {
  assert.equal(getWorkflowRunStatus({status:"in_progress"}),"in_progress");
  assert.equal(getWorkflowRunStatus({status:"completed",conclusion:"failure"}),"failure");
  assert.equal(getWorkflowRunStatus({status:"completed",conclusion:null}),"completed");
  assert.equal(getWorkflowRunStatus({status:"unexpected"}),"unknown");
});
test("classifies startup failures as failed workflow runs", () => {
  const data = normalizeWorkflowRuns({ workflow_runs: [
    run({
      id: 107,
      conclusion: "startup_failure",
      html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/107",
    }),
  ] }).runs;
  assert.equal(getWorkflowRunStatus(data[0]), "startup_failure");
  assert.deepEqual(filterWorkflowRuns(data, "", "failure").map((item) => item.id), [107]);
  assert.deepEqual(filterWorkflowRuns(data, "", "other"), []);
  assert.deepEqual(summarizeWorkflowRuns(data), {
    inProgress: 0, queued: 0, successful: 0, failed: 1, cancelled: 0, other: 0,
  });
});

test("accepts only positive integer workflow IDs and canonical GitHub run URLs", () => {
  const invalidIds = [true, 101.5, "1e2", "101.5", Number.MAX_SAFE_INTEGER + 1, "0", -1];
  const invalidIdRuns = invalidIds.map((id, index) => run({
    id,
    html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/" + String(id) + "-" + index,
  }));
  const unsafeUrls = [
    "https://github.com:444/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/201",
    "https://user@github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/202",
    "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/203?download=1",
    "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/204#fragment",
    "https://github.com/other/repository/actions/runs/205",
  ].map((html_url, index) => run({ id: 201 + index, html_url }));
  const validStringId = run({
    id: "207",
    html_url: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/207",
  });
  const result = normalizeWorkflowRuns({ workflow_runs: [...invalidIdRuns, ...unsafeUrls, validStringId] });
  assert.deepEqual(result.runs.map((item) => item.id), [207]);
});

test("search and status filters operate on normalized workflow metadata", () => {
  const data=normalizeWorkflowRuns({workflow_runs:[
    run(),
    run({id:102,status:"in_progress",conclusion:null,head_branch:"feature/queue",run_number:987,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/102"}),
    run({id:103,conclusion:"failure",run_number:988,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/103"}),
    run({id:104,conclusion:"timed_out",run_number:989,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/104"}),
    run({id:105,status:"waiting",conclusion:null,run_number:990,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/105"}),
    run({id:106,status:"custom_state",conclusion:null,run_number:991,html_url:"https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs/106"}),
  ]}).runs;
  assert.deepEqual(filterWorkflowRuns(data,"main push","success").map(x=>x.id),[101]);
  assert.deepEqual(filterWorkflowRuns(data,"feature queue","in_progress").map(x=>x.id),[102]);
  assert.deepEqual(filterWorkflowRuns(data,"","failure").map(x=>x.id),[103,104]);
  assert.deepEqual(filterWorkflowRuns(data,"","other").map(x=>x.id),[105,106]);
  assert.deepEqual(filterWorkflowRuns(data,"not-present"),[]);
});
test("parses GitHub retry hints and explains primary and secondary rate limits", () => {
  const now = Date.UTC(2026, 10, 22, 0, 0, 0);
  assert.equal(parseGitHubRetryAfter("42", now), 42);
  assert.equal(parseGitHubRetryAfter("Sun, 22 Nov 2026 00:00:12 GMT", now), 12);
  assert.equal(parseGitHubRetryAfter("Sun, 22 Nov 2026 00:00:00 GMT", now), 0);
  assert.equal(parseGitHubRetryAfter("not-a-date", now), null);
  assert.equal(parseGitHubRetryAfter("999999999999999999999999999999", now), null);

  assert.equal(
    getWorkflowRunsErrorMessage(403, new Headers({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(now / 1000 + 90),
    }), now),
    "GitHub's public API rate limit has been reached. Try again in about 2 minutes or open Actions directly.",
  );
  assert.equal(
    getWorkflowRunsErrorMessage(403, new Headers({ "retry-after": "45" }), now),
    "GitHub's public API rate limit has been reached. Try again in about 45 seconds or open Actions directly.",
  );
  assert.equal(
    getWorkflowRunsErrorMessage(429, new Headers({
      "retry-after": "Sun, 22 Nov 2026 00:00:12 GMT",
    }), now),
    "GitHub's public API rate limit has been reached. Try again in about 12 seconds or open Actions directly.",
  );
  assert.equal(
    getWorkflowRunsErrorMessage(403, new Headers(), now),
    "GitHub Actions returned HTTP 403. Check the public repository or open Actions directly.",
  );
});

test("summarizes only the supplied recent window and keeps other states explicit", () => {
  assert.deepEqual(summarizeWorkflowRuns([
    {status:"in_progress"},{status:"queued"},{status:"completed",conclusion:"success"},
    {status:"completed",conclusion:"failure"},{status:"completed",conclusion:"timed_out"},
    {status:"completed",conclusion:"cancelled"},{status:"waiting"},
  ]),{inProgress:1,queued:1,successful:1,failed:2,cancelled:1,other:1});
});
