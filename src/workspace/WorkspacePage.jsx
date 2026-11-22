import React from "react";
import {
 Activity, ArrowRight, ArrowUpRight, Bot, Boxes, Braces, CheckCircle2, CircleDot,
 Clock3, Code2, Command, Cpu, Database, FileCode2, GitBranch, GitPullRequest,
 Globe2, LayoutDashboard, LockKeyhole, Network, Radio, RefreshCw, Rocket, Search,
 Settings2, ShieldCheck, Sparkles, Terminal, Timer, Workflow
} from "lucide-react";
import { api } from "../lib/api.js";
import { filterWorkflowRuns, getWorkflowRunStatus, normalizeWorkflowRuns, summarizeWorkflowRuns } from "../lib/github-actions.js";
import { getWorkspaceHref } from "../lib/routes.js";
import { filterTaskTemplates, TASK_TEMPLATES, WORKSPACE_PAGE_CONTENT } from "./page-data.js";
import { filterRunEvents, getCurrentRunActivity, getRunEventStatuses, isRunCompleted, isRunEventPage, mergeRunActivity, summarizeRunUsage } from "../lib/runs.js";

const iconMap={Activity,Bot,Boxes,Braces,CheckCircle2,CircleDot,Clock3,Code2,Command,Cpu,Database,FileCode2,GitBranch,GitPullRequest,Globe2,LayoutDashboard,LockKeyhole,Network,Radio,Rocket,Search,Settings2,ShieldCheck,Sparkles,Terminal,Timer,Workflow};
const iconFor=(name)=>iconMap[name]||Activity;
const statusText={queued:"Queued",running:"Running",review:"Needs review",approved:"Approved",rejected:"Rejected",completed:"Completed",failed:"Failed",cancelled:"Cancelled"};

function Metric({label,value,note,icon:Icon,tone="cyan"}){
 return <article className={"workspace-page-metric metric-tone-"+tone}><span className="workspace-page-metric-icon"><Icon size={17}/></span><div><span className="workspace-page-metric-label">{label}</span><strong>{value}</strong><small>{note}</small></div></article>;
}
function DestinationCard({item}){
 const Icon=iconFor(item.icon);
 const external=!!item.external;
 return <a className="workspace-destination-card" href={external?item.external:getWorkspaceHref(item.href||"overview")} target={external?"_blank":undefined} rel={external?"noreferrer":undefined}><span className="workspace-destination-icon"><Icon size={17}/></span><span className="workspace-destination-copy"><strong>{item.title}</strong><small>{item.description}</small></span>{external?<ArrowUpRight size={15} className="workspace-destination-arrow"/>:<ArrowRight size={15} className="workspace-destination-arrow"/>}</a>;
}
function RunRecord({run,onOpen}){
 const progress=Math.max(0,Math.min(100,Number(run.progress)||0));
 return <button type="button" className="workspace-run-record" onClick={()=>onOpen(run)}><span className="workspace-run-record-main"><span className="workspace-run-id">{run.id}</span><strong>{run.goal||"Untitled workflow"}</strong><small>{run.time||"Time not available"} · {run.kind||"Agent workflow"}</small></span><span className="workspace-run-record-state"><span className={"status-pill status-"+run.status}><i className="status-dot"/>{statusText[run.status]||run.status}</span><span className="workspace-run-progress" role="progressbar" aria-label={"Workflow "+run.id+" progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:progress+"%"}}/></span></span><ArrowRight size={15} className="workspace-run-arrow"/></button>;
}
function TemplateGrid({onSelectTemplate}){
 const templateIcons=[Code2,Activity,Braces,ShieldCheck,Database,Rocket];
 return <section className="workspace-template-section"><div className="workspace-page-section-heading"><div><div className="eyebrow">TASK BRIEF COLLECTION</div><h2>Choose a starting point</h2><p>Prefill the composer, review the brief, and edit it before creating a run.</p></div></div><div className="workspace-template-grid">{TASK_TEMPLATES.map((item,index)=>{const Icon=templateIcons[index]||Sparkles;return <article className="workspace-template-card" key={item.id}><span className="workspace-template-icon"><Icon size={19}/></span><span className="workspace-template-category">{item.category}</span><h3>{item.title}</h3><p>{item.detail}</p><button type="button" className="button-outline full-button" onClick={()=>onSelectTemplate(item)}>Use this brief <ArrowRight size={13}/></button></article>;})}</div></section>;
}
function AgentPanel({route,agents}){
 const agent=agents.find((item)=>item.id===route.agentId);
 if(!agent)return <div className="workspace-empty"><Bot size={24}/><strong>Agent definition unavailable</strong><span>Return to the backend-backed agent registry.</span><a className="button-outline" href={getWorkspaceHref("agents")}>Open agent fleet <ArrowRight size={13}/></a></div>;
 const order=["planner","researcher","architect","coder","tester","reviewer","release"];
 const stage=order.indexOf(route.agentId)+1;
 const Icon=iconFor(route.icon);
 return <div className="workspace-agent-detail"><div className="workspace-agent-profile"><span className={"workspace-agent-avatar tone-"+agent.color}><Icon size={25}/></span><div><div className="eyebrow">SPECIALIST / STAGE {String(stage).padStart(2,"0")} OF 07</div><h2>{agent.name}</h2><p>{agent.role}</p></div><span className="tag-soft">FIXED PIPELINE ROLE</span></div><div className="workspace-agent-mission"><span className="eyebrow">MISSION</span><p>{agent.mission||agent.desc}</p></div><div className="workspace-page-section-heading"><div><div className="eyebrow">CAPABILITY SCOPE</div><h2>What this specialist contributes</h2><p>Capabilities describe the intended artifact, not a promise that external tools are connected.</p></div></div><div className="workspace-capability-grid">{(agent.capabilities||[]).map((item)=><div className="workspace-capability" key={item}><CheckCircle2 size={15}/><span>{item}</span></div>)}</div><div className="workspace-agent-footer"><a href={getWorkspaceHref("agents")} className="button-outline">All specialists <ArrowRight size={13}/></a><a href={getWorkspaceHref("runs")} className="button-primary">Open workflow history <ArrowRight size={13}/></a></div></div>;
}
function RunList({runs,route,openRun}){
 const isActive=route.filter==="active";
 const isAll=route.filter==="all";
 const rows=isActive?runs.filter((run)=>["queued","running"].includes(run.status)):isAll?runs:runs.filter((run)=>["completed","approved","rejected","failed","cancelled"].includes(run.status));
 const heading=isActive?"Queued and running workflows":isAll?"Latest saved workflow records":"Closed workflow records";
 return <section className="workspace-page-section"><div className="workspace-page-section-heading"><div><div className="eyebrow">SAVED RUN RECORDS</div><h2>{heading}</h2><p>Only records currently loaded from the API are listed here. Use Runs & tasks for search, CSV export and pagination.</p></div><a className="button-quiet" href={getWorkspaceHref("runs")}>Open full history <ArrowRight size={13}/></a></div>{rows.length?<div className="workspace-run-list">{rows.map((run)=><RunRecord key={run.id} run={run} onOpen={openRun}/>)}</div>:<div className="workspace-empty"><Workflow size={24}/><strong>{isActive?"No active workflows in the loaded records":isAll?"No workflow records are loaded":"No closed workflows in the loaded records"}</strong><span>Empty results are not replaced with sample runs. Open the main run list to refresh and paginate saved records.</span><a className="button-outline" href={getWorkspaceHref("runs")}>Open runs & tasks <ArrowRight size={13}/></a></div>}</section>;
}
function ActivityPanel({runs,openRun,apiState,config}){
 const [events,setEvents]=React.useState([]);
 const [query,setQuery]=React.useState("");
 const [statusFilter,setStatusFilter]=React.useState("all");
 const [loading,setLoading]=React.useState(false);
 const [error,setError]=React.useState("");
 const [loadedAt,setLoadedAt]=React.useState({key:"",value:""});
 const [loadedRunKey,setLoadedRunKey]=React.useState("");
 const [refreshKey,setRefreshKey]=React.useState(0);
 const recentRuns=(Array.isArray(runs)?runs:[]).filter((run)=>run&&typeof run.id==="string"&&run.id).slice(0,8);
 const runKey=JSON.stringify(recentRuns.map((run)=>run.id));
 const accessBlocked=!!(config?.runtime_access_denied||config?.runtime_configuration_missing);
 const canReadActivity=apiState==="connected"&&!!config&&!accessBlocked;
 React.useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  const cleanup=()=>{active=false;controller.abort();};
  if(apiState!=="connected"||!config||accessBlocked){
   setEvents([]);
   setLoadedAt({key:"",value:""});
   setLoadedRunKey("");
   setLoading(false);
   setError(config?.runtime_configuration_missing
    ?"Server-side workspace access is not configured. Retained event history remains protected."
    :config?.runtime_access_denied
     ?"Workspace access is required to load retained event history."
     :apiState==="connected"
      ?"Runtime configuration is unavailable. Refresh the workspace and try again."
      :apiState==="checking"
       ?"Waiting for the CYRUS API connection before loading event history."
       :"The CYRUS API is unavailable. Reconnect the workspace to inspect event history.");
   return cleanup;
  }
  if(!recentRuns.length){
   setEvents([]);
   setLoadedAt({key:"",value:""});
   setLoadedRunKey("");
   setLoading(false);
   setError("");
   return cleanup;
  }
  setLoading(true);
  setError("");
  async function load(){
   const results=[];
   for(let offset=0;offset<recentRuns.length;offset+=4){
    const batchRuns=recentRuns.slice(offset,offset+4);
    const batch=await Promise.allSettled(batchRuns.map((run)=>api.runEvents(run.id,null,{signal:controller.signal})));
    results.push(...batch);
    if(!active)return;
   }
   if(!active)return;
   const sources=[];
   let failures=0;
   let unauthorized=false;
   results.forEach((result,index)=>{
    if(result.status==="fulfilled"&&isRunEventPage(result.value)){
     const run=recentRuns[index];
     sources.push({runId:run.id,goal:run.goal,status:run.status,events:result.value.items});
    }else{
     if(result.status==="rejected"&&result.reason?.name==="AbortError")return;
     failures+=1;
     if(result.status==="rejected"&&[401,403].includes(result.reason?.status))unauthorized=true;
    }
   });
   setEvents(mergeRunActivity(events,sources,recentRuns.map((run)=>run.id),50));
   setLoadedRunKey(runKey);
   if(sources.length)setLoadedAt({key:runKey,value:new Date().toISOString()});
   setError(unauthorized
    ?"Workspace access was rejected while loading event history. Re-enter the key in Settings and retry."
    :failures
     ?"Event history could not be loaded for "+failures+" of "+recentRuns.length+" recent workflows."
     :"");
   setLoading(false);
  }
  load().catch((cause)=>{
   if(!active||cause?.name==="AbortError")return;
   setError(cause?.message||"Could not load workflow activity.");
   setLoading(false);
  });
  return cleanup;
 },[runKey,apiState,config?.runtime_access_denied,config?.runtime_configuration_missing,Boolean(config),refreshKey]);
 const snapshotCurrent=loadedRunKey===runKey;
 const waitingForSnapshot=canReadActivity&&recentRuns.length>0&&!snapshotCurrent;
 const currentEvents=canReadActivity?getCurrentRunActivity(events,loadedRunKey,runKey,recentRuns):[];
 const filtered=filterRunEvents(currentEvents,query,statusFilter);
 const statuses=getRunEventStatuses(currentEvents);
 const loadedDate=loadedAt.key===runKey&&loadedAt.value?new Date(loadedAt.value):null;
 return <section className="workspace-activity-panel" aria-busy={loading||waitingForSnapshot}>
  <div className="workspace-activity-toolbar">
   <label className="workspace-activity-search"><Search size={15} aria-hidden="true"/><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search message, run or agent" aria-label="Search retained activity"/></label>
   <label className="workspace-activity-filter"><span className="workspace-sr-only">Filter activity by status</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)} aria-label="Filter activity by status"><option value="all">All statuses</option>{statuses.map((value)=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</select></label>
   <button type="button" className="workspace-activity-refresh" onClick={()=>setRefreshKey((value)=>value+1)} disabled={loading||!recentRuns.length||apiState!=="connected"||accessBlocked}><RefreshCw size={13} className={loading?"spin-icon":""}/>{loading?"Loading":"Refresh activity"}</button>
  </div>
  <div className="workspace-activity-summary" role="status" aria-live="polite">
   <span>{loading?"Loading retained events…":"Showing "+filtered.length+" of "+currentEvents.length+" retained events"}</span>
   <span>Up to {recentRuns.length} latest loaded workflows · 250 retained events per workflow</span>
   {loadedDate&&!Number.isNaN(loadedDate.getTime())?<time dateTime={loadedDate.toISOString()}>Updated {loadedDate.toLocaleTimeString()}</time>:null}
  </div>
  {error?<div className="notice-strip" role="alert"><Activity size={15}/><span>{error} <a href={getWorkspaceHref("settings")}>Open settings</a></span></div>:null}
  {(loading||waitingForSnapshot)&&!currentEvents.length?<div className="workspace-empty"><Activity size={22}/><strong>Loading retained event history</strong><span>Reading saved events from the latest loaded workflow records.</span></div>:null}
  {!loading&&!waitingForSnapshot&&canReadActivity&&!error&&!recentRuns.length?<div className="workspace-empty"><Activity size={22}/><strong>No workflow records loaded</strong><span>Load saved workflows before inspecting their retained activity.</span><a className="button-outline" href={getWorkspaceHref("runs")}>Open runs & tasks <ArrowRight size={13}/></a></div>:null}
  {!loading&&!waitingForSnapshot&&error&&!currentEvents.length?<div className="workspace-empty"><Activity size={22}/><strong>Activity is unavailable</strong><span>Check the API connection or workspace access, then refresh this page.</span></div>:null}
  {!loading&&!waitingForSnapshot&&canReadActivity&&!error&&recentRuns.length>0&&!currentEvents.length?<div className="workspace-empty"><Activity size={22}/><strong>No retained events found</strong><span>The loaded workflows do not currently expose retained event records.</span></div>:null}
  {currentEvents.length>0&&!filtered.length?<div className="workspace-empty"><Search size={22}/><strong>No activity matches these filters</strong><span>Try another search term or clear the selected status.</span><button type="button" className="button-outline" onClick={()=>{setQuery("");setStatusFilter("all");}}>Clear filters</button></div>:null}
  {filtered.length?<div className="workspace-activity-list">{filtered.map((event)=>{
   const occurred=Number.isFinite(event.timestamp)?new Date(event.timestamp):null;
   return <button type="button" className="workspace-activity-row" key={event.runId+"-"+event.id} onClick={()=>openRun({id:event.runId,goal:event.goal,status:event.runStatus})} aria-label={"Open workflow "+event.runId+" event "+event.id}>
    <span className={"workspace-activity-dot status-"+event.status} aria-hidden="true"/>
    <span className="workspace-activity-main">
     <span className="workspace-activity-main-top"><strong>{event.message||"Workflow event"}</strong><span className={"workspace-activity-status status-"+event.status}>{event.status}</span></span>
     <span className="workspace-activity-meta">{event.agent||"System"} · {event.stage||"Workflow"} · {event.runId}</span>
     <span className="workspace-activity-goal">{event.goal}</span>
    </span>
    <span className="workspace-activity-time">{occurred?<time dateTime={occurred.toISOString()}>{occurred.toLocaleString()}</time>:"Time unavailable"}<ArrowRight size={14}/></span>
   </button>;
  })}</div>:null}
  <p className="workspace-footnote">This stream merges retained events from up to eight of the latest loaded workflow summaries. It is not a global trace or a separate audit service.</p>
 </section>;
}

function RuntimePanel({config,apiState}){
 const snapshotAvailable=apiState==="connected"&&!!config;
 const ready=snapshotAvailable&&!!config.can_start_runs;
 const checks=[
  ["API connection",apiState==="connected"?"Ready":apiState==="checking"?"Checking":"Unavailable"],
  ["Workspace access",!snapshotAvailable?"Unknown":!config.auth_required||!!config.access_control_configured?"Ready":"Needs attention"],
  ["AI provider",!snapshotAvailable?"Unknown":config.provider_configured?"Ready":"Needs attention"],
  ["Database connection",!snapshotAvailable?"Unknown":config.database_reachable?"Ready":"Needs attention"],
  ["Persistent storage",!snapshotAvailable?"Unknown":config.persistent_storage?"Ready":"Needs attention"],
  ["Execution worker",!snapshotAvailable?"Unknown":!config.worker_required||!!config.worker_ready?"Ready":"Needs attention"]
 ];
 return <div className="workspace-runtime-list"><div className="workspace-runtime-banner"><span className={ready?"runtime-signal runtime-signal-ready":"runtime-signal"}/><div><strong>{ready?"Ready to start live workflows":apiState==="connected"?"Runtime setup required":apiState==="checking"?"Checking runtime dependencies":"API connection not confirmed"}</strong><small>{ready?"The API currently reports every launch gate as ready.":snapshotAvailable?"Resolve each server-side prerequisite before submitting a real task.":"Runtime checks are unknown until a fresh API snapshot is available."}</small></div></div>{checks.map(([label,state])=><div className="workspace-runtime-check" key={label}><span className={state==="Ready"?"check-indicator check-ok":"check-indicator"}>{state==="Ready"?<CheckCircle2 size={15}/>:<CircleDot size={15}/>}</span><strong>{label}</strong><span>{state}</span></div>)}</div>;
}
function QueuePanel({config,apiState,onRefreshRuntime}){
 const [refreshing,setRefreshing]=React.useState(false);
 const [refreshError,setRefreshError]=React.useState("");
 const [refreshMessage,setRefreshMessage]=React.useState("");
 const restricted=!!(config?.runtime_access_denied||config?.runtime_configuration_missing);
 const snapshotAvailable=apiState==="connected"&&!!config&&!restricted;
 const available=snapshotAvailable&&config.queued_workflows!=null&&config.running_workflows!=null;
 const workerReady=snapshotAvailable&&!!config.worker_ready;
 const workerStatus=config?.runtime_configuration_missing?"Server access control not configured":config?.runtime_access_denied?"Workspace access required":!snapshotAvailable?"Worker status unknown":workerReady?"Worker heartbeat is fresh":config.worker_required?"No fresh worker heartbeat":"External worker not required";
 const values=[["Queued",available?config.queued_workflows:"—"],["Running",available?config.running_workflows:"—"],["Orphaned",available?(config.orphaned_workflows??"—"):"—"],["Workers available",snapshotAvailable?(config.available_workers??"—"):"—"]];
 async function refresh(){
  if(refreshing||typeof onRefreshRuntime!=="function")return;
  setRefreshing(true);
  setRefreshError("");
  setRefreshMessage("");
  try{
   await onRefreshRuntime();
   setRefreshMessage("Queue snapshot refreshed.");
  }
  catch(error){setRefreshError(error?.message||"Could not refresh queue telemetry.");}
  finally{setRefreshing(false);}
 }
 const detail=config?.runtime_configuration_missing
  ?"CYRUS_ACCESS_KEY must be configured in the server environment before queue telemetry is available."
  :config?.runtime_access_denied
   ?"Enter a valid workspace access key to inspect queue and worker capacity."
   :available
    ?"Queue and worker counts are from the latest runtime snapshot."
    :"Queue and worker state remain unknown until the API returns a fresh database snapshot.";
 return <div className="workspace-queue-panel"><div className="workspace-queue-toolbar"><span className="eyebrow">LIVE RUNTIME SNAPSHOT</span><button className="button-outline" type="button" onClick={refresh} disabled={refreshing||typeof onRefreshRuntime!=="function"}><RefreshCw size={13} className={refreshing?"spin-icon":""}/>{refreshing?"Refreshing":"Refresh snapshot"}</button><span className="workspace-sr-only" role="status" aria-live="polite">{refreshMessage}</span></div>{snapshotAvailable&&config.snapshot_at?(()=>{const captured=new Date(config.snapshot_at);return Number.isNaN(captured.getTime())?null:<p className="workspace-queue-snapshot-time">Snapshot captured <time dateTime={captured.toISOString()}>{captured.toLocaleString()}</time></p>;})():null}<div className="workspace-queue-grid">{values.map(([label,value])=><div className="workspace-queue-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="workspace-runtime-banner"><span className={workerReady?"runtime-signal runtime-signal-ready":"runtime-signal"}/><div><strong>{workerStatus}</strong><small>{detail}</small></div></div>{refreshError?<p className="inline-help" role="alert">{refreshError}</p>:null}<a className="button-outline" href={getWorkspaceHref("runs-active")}>Inspect active run records <ArrowRight size={13}/></a></div>;
}
function IntegrationPanel({route,config,apiState}){
 const snapshotAvailable=apiState==="connected"&&!!config;
 const states={
  models:{value:!snapshotAvailable?"Runtime status unavailable":config.provider_configured?(config.model||"Configured on server"):"Not configured",ok:snapshotAvailable&&!!config?.provider_configured,detail:"The API checks provider readiness without returning the credential."},
  research:{value:config?.runtime_configuration_missing?"Server access control not configured":config?.runtime_access_denied?"Workspace access required":!snapshotAvailable?"Runtime status unavailable":config.web_search_enabled?"Enabled for Scout":"Not enabled",ok:snapshotAvailable&&!config?.runtime_access_denied&&!config?.runtime_configuration_missing&&!!config?.web_search_enabled,detail:config?.runtime_configuration_missing?"Configure CYRUS_ACCESS_KEY on the API before inspecting this protected runtime flag.":config?.runtime_access_denied?"Enter a valid workspace access key to inspect this runtime flag.":"A runtime feature flag is not evidence of a connected browser or MCP service."},
  github:{value:"Public source link only",ok:false,detail:"No GitHub API or app connection is configured in this workspace. Open the public repository and Actions pages; agent workflows do not write commits, branches or pull requests."},
  database:{value:!snapshotAvailable?"Runtime status unavailable":config.database_reachable?"Reachable":"Not reachable",ok:snapshotAvailable&&!!config?.database_reachable,detail:"Database reachability and durable production storage are separate checks."}
 };
 const state=states[route.integration]||{value:"Status unavailable",ok:false,detail:"No integration status is available for this destination."};
 return <div className="workspace-integration-panel"><div className="workspace-integration-status"><span className={state.ok&&apiState==="connected"?"integration-signal integration-signal-ok":"integration-signal"}/><div><div className="eyebrow">{route.integration==="github"?"SOURCE REFERENCE":"CURRENT RUNTIME SNAPSHOT"}</div><h2>{state.value}</h2><p>{state.detail}</p></div></div>{route.integration==="database"?<div className="workspace-runtime-check"><strong>Durable production storage</strong><span>{apiState!=="connected"?"Unknown":config?.persistent_storage?(config.database_dialect||"Configured"):"Managed PostgreSQL / MySQL required"}</span></div>:null}{route.integration==="models"?<div className="workspace-runtime-check"><strong>Configured model</strong><span>{apiState==="connected"?(config?.model||"Not reported"):"Unknown"}</span></div>:null}{route.integration==="github"?<div className="notice-strip"><LockKeyhole size={16}/><span>GitHub is a read-only source link. Agent-generated patches remain reviewable artifacts and are not pushed.</span></div>:null}</div>;
}
function UsagePanel({runs,openRun}){
 const usage=summarizeRunUsage(runs);
 const candidates=runs.filter((run)=>Number(run?.stage_count)>0&&!(Array.isArray(run?.stages)&&run.stages.length>0)).slice(0,3);
 const message=usage.hasUsage
  ?"Totals cover "+usage.stageUsageCount+" stages across "+usage.detailedRunCount+" run details opened in this workspace."
  :usage.detailedRunCount
   ?"Opened run details do not include provider token usage metadata."
   :"The run list returns lightweight summaries. Open a saved run below to load its stage details before reviewing token counts.";
 return <div className="workspace-usage-panel"><div className="workspace-usage-numbers"><div><span>INPUT TOKENS IN OPENED DETAILS</span><strong>{usage.hasUsage?usage.inputTokens.toLocaleString():"Not available"}</strong></div><div><span>OUTPUT TOKENS IN OPENED DETAILS</span><strong>{usage.hasUsage?usage.outputTokens.toLocaleString():"Not available"}</strong></div></div><div className="notice-strip"><Activity size={16}/><span>{message} Cost is not estimated because model pricing and complete usage data are not exposed.</span></div>{!usage.hasUsage&&candidates.length?<div className="workspace-usage-run-list"><div className="eyebrow">LOAD SAVED RUN DETAILS</div>{candidates.map((run)=><button type="button" className="workspace-usage-run" key={run.id} onClick={()=>openRun(run)}><span><strong>{run.id}</strong><small>{run.goal||"Untitled workflow"}</small></span><ArrowRight size={14}/></button>)}</div>:null}</div>;
}
function PolicyPanel(){
 const policies=[["Generated code is not executed","Agent code and patches are saved as reviewable artifacts."],["GitHub is not written by agent runs","No automatic commit, branch or pull-request operation is connected."],["Approval does not deploy","A human decision updates the review record; release deployment is separate."],["Secrets stay server-side","Provider credentials and database URLs are not included in browser responses."],["Worker readiness is explicit","A queued workflow is not treated as running until the configured worker holds a lease."]];
 return <div className="workspace-policy-list">{policies.map(([title,description],index)=><article className="workspace-policy-row" key={title}><span className="workspace-policy-index">{String(index+1).padStart(2,"0")}</span><div><strong>{title}</strong><p>{description}</p></div><span className="tag-soft">ENFORCED BOUNDARY</span></article>)}</div>;
}
function AuditRecord({run,onOpen}){
 const decision=run.approval_status==="approved"?"Approved":run.approval_status==="rejected"?"Rejected":run.status==="review"?"Awaiting review":"No review decision";
 const count=Number(run.event_count);
 const eventSummary=Number.isFinite(count)?Math.max(0,Math.floor(count))+" retained events":"Event count unavailable";
 const stage=run.current_stage?"Stage: "+run.current_stage:"No active stage";
 return <button type="button" className="workspace-audit-record" onClick={()=>onOpen(run)}>
  <span className="workspace-audit-record-main"><span className="workspace-run-id">{run.id}</span><strong>{run.goal||"Untitled workflow"}</strong><small>{run.time||"Time not available"} · {stage}</small></span>
  <span className="workspace-audit-record-meta"><span className={"status-pill status-"+run.status}><i className="status-dot"/>{statusText[run.status]||"Unknown"}</span><small>{decision}</small><small>{eventSummary}</small></span>
  <ArrowRight size={15} className="workspace-run-arrow"/>
 </button>;
}
function AuditPanel({runs,openRun}){
 return <section className="workspace-page-section workspace-audit-panel">
  <div className="workspace-page-section-heading"><div><div className="eyebrow">PERSISTED WORKFLOW RECORDS</div><h2>Latest saved activity</h2><p>These rows come from loaded API summaries. Open a record to inspect its saved artifacts and retained event history.</p></div></div>
  {runs.length?<div className="workspace-audit-list">{runs.map((run)=><AuditRecord key={run.id} run={run} onOpen={openRun}/>)}</div>:<div className="workspace-empty"><FileCode2 size={24}/><strong>No workflow records loaded</strong><span>Refresh the run history to inspect persisted workflow decisions.</span><a className="button-outline" href={getWorkspaceHref("runs")}>Open runs & tasks <ArrowRight size={13}/></a></div>}
 </section>;
}
function AppearancePanel(){
 const values=[["Midnight","#070b18"],["Panel","#0d1528"],["Electric cyan","#67e8f9"],["Periwinkle","#7da5ff"],["Violet","#b69cff"],["Mint","#62f2d2"]];
 return <div className="workspace-appearance-panel"><div className="workspace-swatch-grid">{values.map(([name,color])=><div className="workspace-swatch" key={name}><span style={{background:color}}/><div><strong>{name}</strong><code>{color}</code></div></div>)}</div><div className="notice-strip"><Sparkles size={16}/><span>The current theme is consistent across the workspace. A saved theme editor is not implemented; this page documents the active tokens only.</span></div></div>;
}

function PromptLibraryPanel({onSelectTemplate}){
 const [query,setQuery]=React.useState("");
 const [category,setCategory]=React.useState("All");
 const categories=["All",...Array.from(new Set(TASK_TEMPLATES.map((item)=>item.category)))];
 const filtered=filterTaskTemplates(TASK_TEMPLATES,query,category);
 const templateIcons=[Code2,Activity,Braces,ShieldCheck,Database,Rocket];
 return <section className="workspace-prompt-library">
  <div className="workspace-prompt-toolbar">
   <label className="workspace-prompt-search"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search title, category, capability or goal" aria-label="Search engineering briefs"/></label>
   <span className="workspace-prompt-count" aria-live="polite">{filtered.length} of {TASK_TEMPLATES.length} briefs</span>
  </div>
  <div className="workspace-prompt-categories" role="group" aria-label="Filter briefs by category">
   {categories.map((item)=><button key={item} type="button" className={"workspace-prompt-category"+(category===item?" is-active":"")} aria-pressed={category===item} onClick={()=>setCategory(item)}>{item}</button>)}
  </div>
  {filtered.length?<div className="workspace-prompt-grid">{filtered.map((item)=>{const index=TASK_TEMPLATES.indexOf(item);const Icon=templateIcons[index]||Sparkles;return <article className="workspace-template-card workspace-prompt-card" key={item.id}><span className="workspace-template-icon"><Icon size={19}/></span><span className="workspace-template-category">{item.category}</span><h3>{item.title}</h3><p>{item.detail}</p><button type="button" className="button-outline full-button" onClick={()=>onSelectTemplate(item)}>Use this brief <ArrowRight size={13}/></button></article>;})}</div>:<div className="workspace-empty workspace-prompt-empty"><FileCode2 size={24}/><strong>No briefs match these filters</strong><span>Try another term or clear the current category and search.</span><button type="button" className="button-outline" onClick={()=>{setQuery("");setCategory("All");}}>Clear filters</button></div>}
  <p className="workspace-prompt-note">Selecting a brief only prefills the task composer. Review and edit it before creating a workflow; nothing starts automatically.</p>
 </section>;
}

function ObservabilityPanel({runs,config,apiState}){
 const statusMeta=[["queued","Queued"],["running","Running"],["review","Needs review"],["completed","Completed"],["approved","Approved"],["rejected","Rejected"],["failed","Failed"],["cancelled","Cancelled"]];
 const distribution=statusMeta.map(([status,label])=>({status,label,count:runs.filter((run)=>run.status===status).length})).filter((item)=>item.count>0);
 const knownCount=distribution.reduce((sum,item)=>sum+item.count,0);
 const unknownCount=Math.max(0,runs.length-knownCount);
 if(unknownCount)distribution.push({status:"unknown",label:"Other / unknown",count:unknownCount});
 const restricted=!!(config?.runtime_access_denied||config?.runtime_configuration_missing);
 const queueAvailable=apiState==="connected"&&!!config&&!restricted&&config.queued_workflows!=null&&config.running_workflows!=null;
 const runtimeTitle=apiState!=="connected"?"API connection unavailable":config?.runtime_configuration_missing?"Server access control not configured":config?.runtime_access_denied?"Workspace access required":queueAvailable?"Queue snapshot available":"Queue telemetry unavailable";
 const runtimeDetail=queueAvailable
  ?"The queue and running counts below come from the latest protected runtime snapshot."
  :config?.runtime_configuration_missing
   ?"Configure server-side workspace access before inspecting protected queue telemetry."
   :config?.runtime_access_denied
    ?"A valid workspace access key is required to inspect protected queue telemetry."
    :"Queue counts remain unknown until the API returns an accessible runtime snapshot.";
 return <div className="workspace-observability-panel">
  <div className="workspace-observability-grid">
   <section className="workspace-observability-card">
    <div className="workspace-observability-heading"><div><div className="eyebrow">LOADED API RECORDS</div><h3>Workflow status distribution</h3></div><span>{runs.length} records</span></div>
    {runs.length?<div className="workspace-observability-bar" role="img" aria-label={"Status distribution across "+runs.length+" loaded workflow records"}>{distribution.map((item)=><span key={item.status} className={"workspace-observability-segment status-"+item.status} style={{width:((item.count/runs.length)*100)+"%"}} title={item.label+": "+item.count}/>)}</div>:<div className="workspace-empty workspace-observability-empty"><Activity size={22}/><strong>No workflow records loaded</strong><span>The distribution will appear after the API returns saved workflow summaries.</span><a className="button-outline" href={getWorkspaceHref("runs")}>Open run history <ArrowRight size={13}/></a></div>}
    {distribution.length?<ul className="workspace-observability-legend">{distribution.map((item)=><li key={item.status}><span className={"workspace-observability-dot status-"+item.status}/><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul>:null}
    <p className="workspace-observability-footnote">This breakdown covers only the records currently loaded in the browser. The headline totals above are separate API aggregates.</p>
   </section>
   <section className="workspace-observability-card">
    <div className="eyebrow">PROTECTED RUNTIME TELEMETRY</div><h3>{runtimeTitle}</h3><p>{runtimeDetail}</p>
    <div className="workspace-observability-runtime-row"><span>Queued workflows</span><strong>{queueAvailable?config.queued_workflows:"Unknown"}</strong></div>
    <div className="workspace-observability-runtime-row"><span>Running workflows</span><strong>{queueAvailable?config.running_workflows:"Unknown"}</strong></div>
    <a className="button-outline full-button" href={getWorkspaceHref("observability-queue")}>Open queue monitor <ArrowRight size={13}/></a>
   </section>
  </div>
  <div className="workspace-destination-grid">
   <DestinationCard item={{title:"Activity stream",description:"Inspect recent saved workflow records.",href:"observability-activity",icon:"Radio"}}/>
   <DestinationCard item={{title:"Usage & tokens",description:"Review token usage only when stage details provide it.",href:"observability-usage",icon:"Braces"}}/>
   <DestinationCard item={{title:"Run history",description:"Search, filter, paginate and export saved runs.",href:"runs",icon:"Workflow"}}/>
  </div>
 </div>;
}

function GovernancePanel({runs,runStats,apiState,config}){
 const evidenceAvailable=apiState==="connected"&&!!runStats;
 const pending=runs.filter((run)=>run.status==="review").length;
 const approved=runs.filter((run)=>run.approval_status==="approved"||run.status==="approved").length;
 const rejected=runs.filter((run)=>run.approval_status==="rejected"||run.status==="rejected").length;
 const accessState=workspaceAccessLabel(config,apiState);
 const controls=[
  ["Generated code","Reviewable artifacts","The API stores generated patches for inspection; it does not execute them."],
  ["Human approval","Recorded decision","Approval or rejection updates a workflow record and does not authorize deployment."],
  ["Repository writes","Not connected","Agent runs do not create GitHub commits, branches or pull requests."],
  ["Release deployment","Separate operator action","The current workflow API does not expose a deployment action."]
 ];
 return <div className="workspace-governance-panel">
  <div className="workspace-governance-metrics">
   <article><span>Pending review</span><strong>{evidenceAvailable?pending:"—"}</strong><small>Loaded workflow records</small></article>
   <article><span>Approved</span><strong>{evidenceAvailable?approved:"—"}</strong><small>Loaded workflow records</small></article>
   <article><span>Rejected</span><strong>{evidenceAvailable?rejected:"—"}</strong><small>Loaded workflow records</small></article>
   <article><span>Workspace access</span><strong>{accessState}</strong><small>Current runtime snapshot</small></article>
  </div>
  <section className="workspace-governance-controls">
   <div className="workspace-page-section-heading"><div><div className="eyebrow">AUTHORITY BOUNDARIES</div><h3>What the workspace can and cannot do</h3><p>These boundaries describe the current API surface, not a claim of enterprise RBAC or an external audit service.</p></div></div>
   {controls.map(([title,state,detail],index)=><article className="workspace-governance-control" key={title}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{title}</strong><p>{detail}</p></div><small>{state}</small></article>)}
  </section>
  <div className="workspace-destination-grid">
   <DestinationCard item={{title:"Safety policies",description:"Read the detailed execution, repository and release constraints.",href:"governance-policies",icon:"LockKeyhole"}}/>
   <DestinationCard item={{title:"Workflow audit log",description:"Inspect retained events and recorded decisions for saved runs.",href:"governance-audit",icon:"FileCode2"}}/>
   <DestinationCard item={{title:"Review queue",description:"Open artifacts and record an explicit human decision.",href:"review",icon:"ShieldCheck"}}/>
   <DestinationCard item={{title:"Workspace access",description:"Inspect server-side access configuration without exposing a key.",href:"settings-access",icon:"LockKeyhole"}}/>
  </div>
 </div>;
}

function workspaceAccessLabel(config,apiState){
 if(apiState!=="connected"||!config)return "Unknown";
 if(config.runtime_configuration_missing)return "Not configured";
 if(config.runtime_access_denied)return "Access denied";
 if(config.auth_required)return config.access_control_configured?"Protected":"Configuration unknown";
 return "Not required";
}

function AccessPanel({config,apiState}){
 const snapshotAvailable=apiState==="connected"&&!!config;
 const status=workspaceAccessLabel(config,apiState);
 const gate=snapshotAvailable
  ?config.runtime_configuration_missing?"Not configured":config.auth_required?(config.access_control_configured?"Configured":"Not confirmed"):"Not required"
  :"Unknown";
 const request=snapshotAvailable
  ?config.runtime_access_denied?"Access denied":config.auth_required?"Authorized runtime snapshot":"No key required"
  :"Unknown";
 const detail=!snapshotAvailable
  ?"Access state is unknown until the API returns a runtime configuration response."
  :config.runtime_configuration_missing
   ?"The API reports that server-side workspace access control is not configured. Do not treat a browser-only key prompt as a security boundary."
   :config.runtime_access_denied
    ?"The current request was not authorized. Enter the workspace key in Settings if you have been issued one; the value is never displayed here."
    :config.auth_required
     ?"The API reports a protected workspace. This is a shared workspace access key, not per-user role-based access control."
     :"The API reports that a workspace key is not required for this deployment.";
 return <div className="workspace-access-panel">
  <div className="workspace-access-banner"><span className="workspace-access-icon"><LockKeyhole size={20}/></span><div><div className="eyebrow">SERVER-REPORTED ACCESS STATE</div><h3>{status}</h3><p>{detail}</p></div></div>
  <div className="workspace-access-rows">
   {[["Server-side access gate",gate],["Current runtime request",request],["Credential value","Never returned to the browser"],["Permission model","No per-user RBAC endpoint is exposed"]].map(([label,value])=><div className="workspace-access-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </div>
  <div className="notice-strip"><LockKeyhole size={16}/><span>Never paste credentials into a task prompt or share them in screenshots. This page intentionally does not read or display the stored key.</span></div>
  <div className="workspace-access-actions"><a className="button-primary" href={getWorkspaceHref("settings")}>Open access settings <ArrowRight size={13}/></a><a className="button-outline" href={getWorkspaceHref("settings-runtime")}>Review runtime health <ArrowRight size={13}/></a></div>
 </div>;
}


const GITHUB_ACTIONS_API = "https://api.github.com/repos/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions/runs?per_page=12";
const GITHUB_ACTIONS_URL = "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions";
const GITHUB_REPOSITORY_URL = "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System";
const workflowStatusLabels = {queued:"Queued",in_progress:"In progress",success:"Passed",failure:"Failed",cancelled:"Cancelled",timed_out:"Timed out",action_required:"Action required",skipped:"Skipped",neutral:"Neutral",stale:"Stale",completed:"Completed",waiting:"Waiting",pending:"Pending",requested:"Requested",unknown:"Unknown"};
function WorkflowRunState({run}){
 const status=getWorkflowRunStatus(run);
 return <span className={"workspace-ci-state status-"+status} aria-label={"Workflow result: "+(workflowStatusLabels[status]||"Unknown")}><i aria-hidden="true"/>{workflowStatusLabels[status]||"Unknown"}</span>;
}
function CiPanel(){
 const [snapshot,setSnapshot]=React.useState({runs:[],totalCount:0});
 const [loading,setLoading]=React.useState(true);
 const [error,setError]=React.useState("");
 const [query,setQuery]=React.useState("");
 const [statusFilter,setStatusFilter]=React.useState("all");
 const [refreshKey,setRefreshKey]=React.useState(0);
 const [updatedAt,setUpdatedAt]=React.useState("");
 React.useEffect(()=>{
  const controller=new AbortController();let active=true;
  async function load(){
   setLoading(true);setError("");
   try{
    const response=await fetch(GITHUB_ACTIONS_API,{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},cache:"no-store",signal:controller.signal});
    if(!response.ok){
     const rateLimited=response.status===403&&response.headers?.get("x-ratelimit-remaining")==="0";
     throw new Error(rateLimited?"GitHub's public API rate limit has been reached. Wait for the reset window or open Actions directly.":"GitHub Actions returned HTTP "+response.status+". Check the public repository or open Actions directly.");
    }
    const next=normalizeWorkflowRuns(await response.json());
    if(!active)return;
    setSnapshot(next);setUpdatedAt(new Date().toISOString());
   }catch(cause){
    if(!active||cause?.name==="AbortError")return;
    setError(cause?.message||"Could not load public GitHub Actions history.");
   }finally{if(active)setLoading(false);}
  }
  load();
  return ()=>{active=false;controller.abort();};
 },[refreshKey]);
 const filtered=filterWorkflowRuns(snapshot.runs,query,statusFilter);
 const summary=summarizeWorkflowRuns(snapshot.runs);
 const latest=snapshot.runs[0];
 const latestStatus=latest?(workflowStatusLabels[getWorkflowRunStatus(latest)]||"Unknown"):"—";
 return <section className="workspace-ci-live" aria-busy={loading}>
  <div className="workspace-ci-summary">
   <article><span>Repository runs</span><strong>{snapshot.totalCount.toLocaleString()}</strong><small>GitHub API total</small></article>
   <article><span>In progress</span><strong>{summary.inProgress}</strong><small>Within latest {snapshot.runs.length}</small></article>
   <article><span>Queued</span><strong>{summary.queued}</strong><small>Within latest {snapshot.runs.length}</small></article>
   <article><span>Failed</span><strong>{summary.failed}</strong><small>Failure or timeout · latest {snapshot.runs.length}</small></article>
  </div>
  <div className="workspace-ci-toolbar">
   <label className="workspace-ci-search"><Search size={15} aria-hidden="true"/><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search workflow, branch, event or commit" aria-label="Search workflow runs"/></label>
   <label className="workspace-ci-filter"><span className="workspace-sr-only">Filter workflow runs by status</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)} aria-label="Filter workflow runs by status"><option value="all">All results</option><option value="in_progress">In progress</option><option value="queued">Queued</option><option value="success">Passed</option><option value="failure">Failed</option><option value="cancelled">Cancelled</option><option value="other">Other states</option></select></label>
   <button type="button" className="workspace-ci-refresh" onClick={()=>setRefreshKey((value)=>value+1)} disabled={loading}><RefreshCw size={13} className={loading?"spin-icon":""}/>{loading?"Refreshing":"Refresh"}</button>
   <a className="button-quiet workspace-ci-actions-link" href={GITHUB_ACTIONS_URL} target="_blank" rel="noreferrer">Open GitHub Actions <ArrowUpRight size={13}/></a>
  </div>
  <div className="workspace-ci-updated" role="status" aria-live="polite"><span>{loading?"Loading public workflow history…":"Showing "+filtered.length+" of "+snapshot.runs.length+" recent runs · latest result: "+latestStatus}</span>{updatedAt?<time dateTime={updatedAt}>Updated {new Date(updatedAt).toLocaleTimeString()}</time>:null}</div>
  {error?<div className="notice-strip" role="alert"><Activity size={15}/><span>{error} <a href={GITHUB_ACTIONS_URL} target="_blank" rel="noreferrer">Open Actions</a></span></div>:null}
  {loading&&!snapshot.runs.length?<div className="workspace-empty"><Activity size={22}/><strong>Loading GitHub Actions history</strong><span>Reading the latest public workflow runs for the main repository.</span></div>:null}
  {!loading&&!error&&!snapshot.runs.length?<div className="workspace-empty"><Workflow size={22}/><strong>No workflow runs were returned</strong><span>GitHub returned an empty public run list. Open Actions to inspect the repository directly.</span><a className="button-outline" href={GITHUB_ACTIONS_URL} target="_blank" rel="noreferrer">Open GitHub Actions <ArrowUpRight size={13}/></a></div>:null}
  {!loading&&error&&!snapshot.runs.length?<div className="workspace-empty"><Activity size={22}/><strong>Live CI history is unavailable</strong><span>Retry after checking connectivity or the public API rate limit.</span><button type="button" className="button-outline" onClick={()=>setRefreshKey((value)=>value+1)}>Retry request</button></div>:null}
  {snapshot.runs.length>0&&!filtered.length?<div className="workspace-empty"><Search size={22}/><strong>No workflow runs match these filters</strong><span>Try another search term or clear the selected result filter.</span><button type="button" className="button-outline" onClick={()=>{setQuery("");setStatusFilter("all");}}>Clear filters</button></div>:null}
  {filtered.length?<div className="workspace-ci-run-list">{filtered.map((run)=>{
   const runLabel=run.runNumber?"#"+run.runNumber:"#"+run.id;
   return <article className="workspace-ci-run" key={run.id}>
    <div className="workspace-ci-run-main"><a className="workspace-ci-run-title" href={run.url} target="_blank" rel="noreferrer">{run.name} <span>{runLabel}</span><ArrowUpRight size={12}/></a><small>{run.event||"Event unavailable"} · {run.branch||"Branch unavailable"}</small></div>
    <div className="workspace-ci-run-meta">{run.sha?<a href={GITHUB_REPOSITORY_URL+"/commit/"+run.sha} target="_blank" rel="noreferrer" aria-label={"Open commit "+run.sha.slice(0,7)}><GitBranch size={12}/>{run.sha.slice(0,7)}</a>:<span>Commit unavailable</span>}{run.createdAt?<time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time>:<span>Time unavailable</span>}</div>
    <WorkflowRunState run={run}/>
   </article>;
  })}</div>:null}
  <p className="workspace-footnote">Read-only public GitHub data. Only the latest {snapshot.runs.length} returned records are summarized; the repository total is shown separately. No token, rerun, cancel or repository-write permission is used. Unauthenticated API requests may be rate-limited.</p>
 </section>;
}

function PageBody({route,runs,runStats,config,apiState,agents,openRun,onSelectTemplate,onRefreshRuntime}){
 if(route.kind==="launchpad")return <TemplateGrid onSelectTemplate={onSelectTemplate}/>;
 if(route.kind==="prompt-library")return <PromptLibraryPanel onSelectTemplate={onSelectTemplate}/>;
 if(route.kind==="agent")return <AgentPanel route={route} agents={agents}/>;
 if(route.kind==="run-list")return <RunList route={route} runs={runs} openRun={openRun}/>;
 if(route.kind==="activity")return <ActivityPanel runs={runs} openRun={openRun} apiState={apiState} config={config}/>;
 if(route.kind==="observability")return <ObservabilityPanel runs={runs} config={config} apiState={apiState}/>;
 if(route.kind==="review-history")return <RunList route={{filter:"history"}} runs={runs.filter((run)=>["approved","rejected"].includes(run.approval_status)||["approved","rejected"].includes(run.status))} openRun={openRun}/>;
 if(route.kind==="integration")return <IntegrationPanel route={route} config={config} apiState={apiState}/>;
 if(route.kind==="queue")return <QueuePanel config={config} apiState={apiState} onRefreshRuntime={onRefreshRuntime}/>;
 if(route.kind==="usage")return <UsagePanel runs={runs} openRun={openRun}/>;
 if(route.kind==="audit")return <AuditPanel runs={runs} openRun={openRun}/>;
 if(route.kind==="governance")return <GovernancePanel runs={runs} runStats={runStats} apiState={apiState} config={config}/>;
 if(route.kind==="policies")return <PolicyPanel/>;
 if(route.kind==="runtime")return <RuntimePanel config={config} apiState={apiState}/>;
 if(route.kind==="access")return <AccessPanel config={config} apiState={apiState}/>;
 if(route.kind==="appearance")return <AppearancePanel/>;
 if(route.kind==="deployment")return <div className="workspace-deployment-note"><div className="workspace-runtime-banner"><span className="runtime-signal"/><div><strong>Verify this deployment with the provider</strong><small>A configured URL does not prove that the latest deployment is ready or live.</small></div></div><a className="button-outline" href={route.target==="api"?"https://vercel.com/mahendra8/cyrus-api":"https://vercel.com/mahendra8/cyrus-workspace"} target="_blank" rel="noreferrer">Open Vercel project <ArrowUpRight size={13}/></a><a className="button-outline" href={route.target==="api"?"https://cyrus-api-mahendra8.vercel.app/docs":"https://cyrus-workspace-mahendra8.vercel.app"} target="_blank" rel="noreferrer">Open configured URL <ArrowUpRight size={13}/></a></div>;
 if(route.kind==="ci")return <CiPanel/>;
 return null;
}
function PageSection({section}){
 return <section className="workspace-page-section"><div className="workspace-page-section-heading"><div><div className="eyebrow">WORKSPACE GUIDE</div><h2>{section.title}</h2><p>{section.description}</p></div></div><div className="workspace-destination-grid">{section.cards.map((item)=><DestinationCard key={item.title} item={item}/>)}</div></section>;
}
export default function WorkspacePage({route,runs=[],runsTotal=0,runStats,workspaceConfig,apiState,agents=[],openRun,onSelectTemplate,onRefreshRuntime}){
 const content=WORKSPACE_PAGE_CONTENT[route.id];
 const Icon=iconFor(route.icon);
 const agent=agents.find((item)=>item.id===route.agentId);
 const active=Number.isFinite(Number(runStats?.active))?Number(runStats.active):runs.filter((run)=>["queued","running"].includes(run.status)).length;
 const completed=Number.isFinite(Number(runStats?.completed))?Number(runStats.completed):runs.filter(isRunCompleted).length;
 const total=Number.isFinite(Number(runStats?.total))?Number(runStats.total):runsTotal;
 const pending=runs.filter((run)=>run.status==="review").length;
 const failed=runs.filter((run)=>run.status==="failed").length;
 const approved=runs.filter((run)=>run.approval_status==="approved"||run.status==="approved").length;
 const rejected=runs.filter((run)=>run.approval_status==="rejected"||run.status==="rejected").length;
 const accessLabel=workspaceAccessLabel(workspaceConfig,apiState);
 const averageProgress=runStats&&runStats.average_progress!=null&&Number.isFinite(Number(runStats.average_progress))?Number(runStats.average_progress).toFixed(1)+"%":"—";
 const promptCategoryCount=new Set(TASK_TEMPLATES.map((item)=>item.category)).size;
 const stats=route.kind==="observability"
  ?[{label:"Total workflows",value:total,note:"API aggregate",icon:Workflow,tone:"blue"},{label:"Active / queued",value:active,note:"API aggregate",icon:Activity,tone:"cyan"},{label:"Completed",value:completed,note:"API aggregate",icon:CheckCircle2,tone:"mint"},{label:"Average progress",value:averageProgress,note:"API aggregate",icon:Radio,tone:"violet"}]
  :route.kind==="prompt-library"
   ?[{label:"Reusable briefs",value:TASK_TEMPLATES.length,note:"Curated engineering briefs",icon:FileCode2,tone:"blue"},{label:"Categories",value:promptCategoryCount,note:"Distinct brief categories",icon:Database,tone:"violet"},{label:"Search",value:"Multi-term",note:"Title, category and goal",icon:Search,tone:"cyan"},{label:"Execution",value:"Prefill only",note:"No automatic workflow start",icon:ShieldCheck,tone:"mint"}]
   :route.kind==="governance"
    ?[{label:"Pending review",value:runStats?pending:"—",note:"Loaded records only",icon:Clock3,tone:"violet"},{label:"Approved",value:runStats?approved:"—",note:"Loaded records only",icon:CheckCircle2,tone:"mint"},{label:"Rejected",value:runStats?rejected:"—",note:"Loaded records only",icon:CircleDot,tone:"pink"},{label:"Access boundary",value:accessLabel,note:"Current runtime snapshot",icon:LockKeyhole,tone:"blue"}]
    :route.kind==="access"
     ?[{label:"Workspace access",value:accessLabel,note:"Server-reported state",icon:LockKeyhole,tone:"blue"},{label:"Key required",value:workspaceConfig?(workspaceConfig.auth_required?"Yes":"No"):"Unknown",note:"Server configuration",icon:ShieldCheck,tone:"violet"},{label:"Server gate",value:workspaceConfig?(workspaceConfig.runtime_configuration_missing?"Missing":workspaceConfig.access_control_configured?"Configured":"Not confirmed"):"Unknown",note:"Never inferred from UI state",icon:Radio,tone:"cyan"},{label:"Credential display",value:"Hidden",note:"Never returned to the browser",icon:LockKeyhole,tone:"mint"}]
     :route.kind==="agent"
  ?[{label:"Pipeline stage",value:agent?.stage||route.agentId,note:"Fixed stage assignment",icon:Network,tone:"violet"},{label:"Specialists",value:"07",note:"Registered role catalog",icon:Bot,tone:"blue"},{label:"Human gate",value:"On",note:"Review before release",icon:ShieldCheck,tone:"mint"}]
  :route.kind==="queue"
   ?[{label:"Queued",value:workspaceConfig?.queued_workflows??"—",note:"Persisted queue",icon:Clock3,tone:"blue"},{label:"Running",value:workspaceConfig?.running_workflows??"—",note:"Persisted running count",icon:Activity,tone:"cyan"},{label:"Orphaned",value:workspaceConfig?.orphaned_workflows??"—",note:"Awaiting recovery",icon:CircleDot,tone:"violet"}]
   :route.group==="Execution"||route.group==="Quality"||route.kind==="run-list"||route.kind==="review-history"
    ?[{label:"Total workflows",value:total,note:"API aggregate when available",icon:Workflow,tone:"blue"},{label:"Active / queued",value:active,note:"Aggregate or loaded records",icon:Activity,tone:"cyan"},{label:"Pending review",value:pending,note:"In loaded records",icon:ShieldCheck,tone:"violet"},{label:"Failed",value:failed,note:"In loaded records",icon:CircleDot,tone:"pink"}]
    :[{label:"Saved workflows",value:total,note:"Persisted API aggregate",icon:Workflow,tone:"blue"},{label:"Completed",value:completed,note:"Aggregate or loaded records",icon:CheckCircle2,tone:"mint"},{label:"Runtime",value:apiState==="connected"?(workspaceConfig?.can_start_runs?"Ready":"Setup"):"Unknown",note:"Backend readiness",icon:Radio,tone:"violet"},{label:"Agent roles",value:"07",note:"Fixed pipeline catalog",icon:Bot,tone:"cyan"}];
 const related=content?.sections?.flatMap((section)=>section.cards||[]).filter((item)=>item.href||item.external).slice(0,4)||[];
 const title=agent?agent.name+" · "+agent.role:(content?.title||route.label);
 const desc=agent?(agent.mission||agent.desc):(content?.description||"A dedicated CYRUS workspace destination.");
 const eyebrow=agent?"AGENT PROFILE / "+(agent.tag||"SPECIALIST"):(content?.eyebrow||route.group.toUpperCase());
 const image=content?.image||"https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80";
 return <div className="view-stack subpage workspace-page">
  <section className="workspace-page-hero"><img src={image} alt="" loading="eager" fetchPriority="high" decoding="async"/><div className="workspace-page-hero-shade"/><div className="workspace-page-hero-copy"><div className="eyebrow"><span className="eyebrow-square"/> {eyebrow}</div><span className="workspace-page-icon"><Icon size={23}/></span><h1>{title}</h1><p>{desc}</p><div className="workspace-page-breadcrumb"><a href={getWorkspaceHref("overview")}>Workspace</a><span>/</span><span>{route.group}</span><span>/</span><strong>{route.label}</strong></div></div><div className="workspace-page-hero-actions"><a className="button-primary" href={getWorkspaceHref("runs",{focusTask:true})}><Sparkles size={14}/> New task</a><a className="button-outline" href={getWorkspaceHref("overview")}>Overview <ArrowUpRight size={13}/></a></div></section>
  <div className="workspace-page-metrics">{stats.map((metric)=><Metric key={metric.label} {...metric}/>)}</div>
  <div className="workspace-page-layout"><main className="workspace-page-main"><section className="panel-card workspace-page-primary"><div className="workspace-page-primary-heading"><div><div className="eyebrow">{route.group.toUpperCase()} / {route.kind.toUpperCase()}</div><h2>{route.kind==="agent"?"Role scope and hand-off":"Workspace view"}</h2><p>{route.kind==="agent"?"Inspect the specialist's mission and artifact contribution.":"This destination combines current workspace evidence with direct paths to the next useful action."}</p></div><Icon size={19}/></div><PageBody route={route} runs={runs} runStats={runStats} config={workspaceConfig} apiState={apiState} agents={agents} openRun={openRun} onSelectTemplate={onSelectTemplate} onRefreshRuntime={onRefreshRuntime}/></section>{content?.sections?.map((section)=><PageSection key={section.title} section={section}/>)}</main>
   <aside className="workspace-page-rail"><section className="panel-card workspace-page-rail-card"><div className="eyebrow">NEXT DESTINATIONS</div><h2>Keep moving</h2><p>Open a related page without returning to the dashboard.</p>{related.map((item)=><DestinationCard key={item.title} item={item}/>)}</section><section className="panel-card workspace-page-rail-card"><div className="eyebrow">RUNTIME READINESS</div><h2>{workspaceConfig?.can_start_runs?"Ready to launch":apiState==="connected"?"Setup required":"Connection unknown"}</h2><p>{workspaceConfig?.can_start_runs?"The API currently reports that workflow launch is enabled.":"Check provider, database, access and worker requirements before starting live work."}</p><a className="button-outline full-button" href={getWorkspaceHref("settings-runtime")}>Inspect runtime <ArrowRight size={13}/></a></section></aside>
  </div>
 </div>;
}
