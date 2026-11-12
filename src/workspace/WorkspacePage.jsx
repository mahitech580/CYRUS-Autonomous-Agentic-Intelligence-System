import React from "react";
import {
 Activity, ArrowRight, ArrowUpRight, Bot, Braces, CheckCircle2, CircleDot,
 Clock3, Code2, Database, FileCode2, GitBranch, Globe2, LockKeyhole,
 Network, Radio, Rocket, ShieldCheck, Sparkles, Terminal, Workflow
} from "lucide-react";
import { getWorkspaceHref } from "../lib/routes.js";
import { TASK_TEMPLATES, WORKSPACE_PAGE_CONTENT } from "./page-data.js";

const iconMap={Activity,Bot,Braces,CheckCircle2,CircleDot,Clock3,Code2,Database,FileCode2,GitBranch,Globe2,LockKeyhole,Network,Radio,Rocket,ShieldCheck,Sparkles,Terminal,Workflow};
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
 const rows=isActive?runs.filter((run)=>["queued","running"].includes(run.status)):runs.filter((run)=>["completed","approved","rejected","failed","cancelled"].includes(run.status));
 return <section className="workspace-page-section"><div className="workspace-page-section-heading"><div><div className="eyebrow">SAVED RUN RECORDS</div><h2>{isActive?"Queued and running workflows":"Closed workflow records"}</h2><p>Only records currently loaded from the API are listed here. Use Runs & tasks for search, CSV export and pagination.</p></div><a className="button-quiet" href={getWorkspaceHref("runs")}>Open full history <ArrowRight size={13}/></a></div>{rows.length?<div className="workspace-run-list">{rows.map((run)=><RunRecord key={run.id} run={run} onOpen={openRun}/>)}</div>:<div className="workspace-empty"><Workflow size={24}/><strong>{isActive?"No active workflows in the loaded records":"No closed workflows in the loaded records"}</strong><span>Empty results are not replaced with sample runs. Open the main run list to refresh and paginate saved records.</span><a className="button-outline" href={getWorkspaceHref("runs")}>Open runs & tasks <ArrowRight size={13}/></a></div>}</section>;
}
function RuntimePanel({config,apiState}){
 const ready=apiState==="connected"&&!!config?.can_start_runs;
 const checks=[
  ["API connection",apiState==="connected"],
  ["Workspace access",!!config&&(!config.auth_required||!!config.access_control_configured)],
  ["AI provider",!!config?.provider_configured],
  ["Database connection",!!config?.database_reachable],
  ["Persistent storage",!!config?.persistent_storage],
  ["Execution worker",!!config&&(!config.worker_required||!!config.worker_ready)]
 ];
 return <div className="workspace-runtime-list"><div className="workspace-runtime-banner"><span className={ready?"runtime-signal runtime-signal-ready":"runtime-signal"}/><div><strong>{ready?"Ready to start live workflows":apiState==="connected"?"Runtime setup required":"API connection not confirmed"}</strong><small>{ready?"The API currently reports every launch gate as ready.":"Resolve each server-side prerequisite before submitting a real task."}</small></div></div>{checks.map(([label,ok])=><div className="workspace-runtime-check" key={label}><span className={ok?"check-indicator check-ok":"check-indicator"}>{ok?<CheckCircle2 size={15}/>:<CircleDot size={15}/>}</span><strong>{label}</strong><span>{ok?"Ready":apiState==="connected"?"Needs attention":"Unknown"}</span></div>)}</div>;
}
function QueuePanel({config,apiState}){
 const available=apiState==="connected"&&config?.queued_workflows!=null&&config?.running_workflows!=null;
 const values=[["Queued",available?config.queued_workflows:"—"],["Running",available?config.running_workflows:"—"],["Orphaned",available?(config.orphaned_workflows??"—"):"—"],["Workers available",apiState==="connected"?(config?.available_workers??"—"):"—"]];
 return <div className="workspace-queue-panel"><div className="workspace-queue-grid">{values.map(([label,value])=><div className="workspace-queue-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="workspace-runtime-banner"><span className={config?.worker_ready?"runtime-signal runtime-signal-ready":"runtime-signal"}/><div><strong>{config?.worker_ready?"Worker heartbeat is fresh":config?.worker_required?"No fresh worker heartbeat":"External worker not required"}</strong><small>{available?"Queue snapshot returned by the runtime API.":"Queue totals remain unknown until the API returns a database snapshot."}</small></div></div><a className="button-outline" href={getWorkspaceHref("runs-active")}>Inspect active run records <ArrowRight size={13}/></a></div>;
}
function IntegrationPanel({route,config,apiState}){
 const snapshotAvailable=apiState==="connected"&&!!config;
 const states={
  models:{value:!snapshotAvailable?"Runtime status unavailable":config.provider_configured?(config.model||"Configured on server"):"Not configured",ok:snapshotAvailable&&!!config?.provider_configured,detail:"The API checks provider readiness without returning the credential."},
  research:{value:!snapshotAvailable?"Runtime status unavailable":config.web_search_enabled?"Enabled for Scout":"Not enabled",ok:snapshotAvailable&&!!config?.web_search_enabled,detail:"A runtime feature flag is not evidence of a connected browser or MCP service."},
  github:{value:"Public source link only",ok:false,detail:"No GitHub API or app connection is configured in this workspace. Open the public repository and Actions pages; agent workflows do not write commits, branches or pull requests."},
  database:{value:!snapshotAvailable?"Runtime status unavailable":config.database_reachable?"Reachable":"Not reachable",ok:snapshotAvailable&&!!config?.database_reachable,detail:"Database reachability and durable production storage are separate checks."}
 };
 const state=states[route.integration]||{value:"Status unavailable",ok:false,detail:"No integration status is available for this destination."};
 return <div className="workspace-integration-panel"><div className="workspace-integration-status"><span className={state.ok&&apiState==="connected"?"integration-signal integration-signal-ok":"integration-signal"}/><div><div className="eyebrow">{route.integration==="github"?"SOURCE REFERENCE":"CURRENT RUNTIME SNAPSHOT"}</div><h2>{state.value}</h2><p>{state.detail}</p></div></div>{route.integration==="database"?<div className="workspace-runtime-check"><strong>Durable production storage</strong><span>{apiState!=="connected"?"Unknown":config?.persistent_storage?(config.database_dialect||"Configured"):"Managed PostgreSQL / MySQL required"}</span></div>:null}{route.integration==="models"?<div className="workspace-runtime-check"><strong>Configured model</strong><span>{apiState==="connected"?(config?.model||"Not reported"):"Unknown"}</span></div>:null}{route.integration==="github"?<div className="notice-strip"><LockKeyhole size={16}/><span>GitHub is a read-only source link. Agent-generated patches remain reviewable artifacts and are not pushed.</span></div>:null}</div>;
}
function UsagePanel({runs}){
 const stages=runs.flatMap((run)=>Array.isArray(run.stages)?run.stages:[]);
 const input=stages.reduce((n,stage)=>n+Math.max(0,Number(stage?.usage?.input_tokens)||0),0);
 const output=stages.reduce((n,stage)=>n+Math.max(0,Number(stage?.usage?.output_tokens)||0),0);
 const found=stages.some((stage)=>stage?.usage&&(stage.usage.input_tokens!=null||stage.usage.output_tokens!=null));
 return <div className="workspace-usage-panel"><div className="workspace-usage-numbers"><div><span>INPUT TOKENS IN LOADED DETAILS</span><strong>{found?input.toLocaleString():"Not available"}</strong></div><div><span>OUTPUT TOKENS IN LOADED DETAILS</span><strong>{found?output.toLocaleString():"Not available"}</strong></div></div><div className="notice-strip"><Activity size={16}/><span>{found?"Totals cover stage usage payloads present in loaded run details.":"The run-list endpoint does not include token usage. Open a detailed run with provider usage metadata to inspect counts."} Cost is not estimated because model pricing and complete usage data are not exposed.</span></div></div>;
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
function PageBody({route,runs,config,apiState,agents,openRun,onSelectTemplate}){
 if(route.kind==="launchpad"||route.kind==="prompt-library")return <TemplateGrid onSelectTemplate={onSelectTemplate}/>;
 if(route.kind==="agent")return <AgentPanel route={route} agents={agents}/>;
 if(route.kind==="run-list"||route.kind==="activity"||route.kind==="observability")return <RunList route={route.kind==="run-list"?route:{filter:"history"}} runs={runs} openRun={openRun}/>;
 if(route.kind==="review-history")return <RunList route={{filter:"history"}} runs={runs.filter((run)=>["approved","rejected"].includes(run.approval_status)||["approved","rejected"].includes(run.status))} openRun={openRun}/>;
 if(route.kind==="integration")return <IntegrationPanel route={route} config={config} apiState={apiState}/>;
 if(route.kind==="queue")return <QueuePanel config={config} apiState={apiState}/>;
 if(route.kind==="usage")return <UsagePanel runs={runs}/>;
 if(route.kind==="audit")return <AuditPanel runs={runs} openRun={openRun}/>;
 if(["governance","policies"].includes(route.kind))return <PolicyPanel/>;
 if(["runtime","access"].includes(route.kind))return <RuntimePanel config={config} apiState={apiState}/>;
 if(route.kind==="appearance")return <AppearancePanel/>;
 if(route.kind==="deployment")return <div className="workspace-deployment-note"><div className="workspace-runtime-banner"><span className="runtime-signal"/><div><strong>Verify this deployment with the provider</strong><small>A configured URL does not prove that the latest deployment is ready or live.</small></div></div><a className="button-outline" href={route.target==="api"?"https://vercel.com/mahendra8/cyrus-api":"https://vercel.com/mahendra8/cyrus-workspace"} target="_blank" rel="noreferrer">Open Vercel project <ArrowUpRight size={13}/></a><a className="button-outline" href={route.target==="api"?"https://cyrus-api-mahendra8.vercel.app/docs":"https://cyrus-workspace-mahendra8.vercel.app"} target="_blank" rel="noreferrer">Open configured URL <ArrowUpRight size={13}/></a></div>;
 if(route.kind==="ci")return <div className="workspace-ci-panel" aria-label="Configured CI checks">
  <div className="workspace-ci-step"><span>01</span><div><strong>Frontend tests and production build</strong><small>Configured Node tests, design-system assertions and Vite production output.</small></div><span className="workspace-ci-step-state">Configured</span></div>
  <div className="workspace-ci-step"><span>02</span><div><strong>Backend tests</strong><small>Configured API, workflow orchestration, security and worker regression tests.</small></div><span className="workspace-ci-step-state">Configured</span></div>
  <div className="workspace-ci-step"><span>03</span><div><strong>Container hardening and smoke test</strong><small>Configured Compose exposure checks and a non-root API image smoke test.</small></div><span className="workspace-ci-step-state">Configured</span></div>
  <a className="button-outline" href="https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions" target="_blank" rel="noreferrer">Open live Actions history <ArrowUpRight size={13}/></a>
  <p className="workspace-footnote">These rows describe configured checks, not current pass/fail results. Open Actions and select the exact commit to verify its outcome.</p>
 </div>;
 return null;
}
function PageSection({section}){
 return <section className="workspace-page-section"><div className="workspace-page-section-heading"><div><div className="eyebrow">WORKSPACE GUIDE</div><h2>{section.title}</h2><p>{section.description}</p></div></div><div className="workspace-destination-grid">{section.cards.map((item)=><DestinationCard key={item.title} item={item}/>)}</div></section>;
}
export default function WorkspacePage({route,runs=[],runsTotal=0,runStats,workspaceConfig,apiState,agents=[],openRun,onSelectTemplate}){
 const content=WORKSPACE_PAGE_CONTENT[route.id];
 const Icon=iconFor(route.icon);
 const agent=agents.find((item)=>item.id===route.agentId);
 const active=Number.isFinite(Number(runStats?.active))?Number(runStats.active):runs.filter((run)=>["queued","running"].includes(run.status)).length;
 const completed=Number.isFinite(Number(runStats?.completed))?Number(runStats.completed):runs.filter((run)=>["completed","approved"].includes(run.status)).length;
 const total=Number.isFinite(Number(runStats?.total))?Number(runStats.total):runsTotal;
 const pending=runs.filter((run)=>run.status==="review").length;
 const failed=runs.filter((run)=>run.status==="failed").length;
 const stats=route.kind==="agent"
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
  <section className="workspace-page-hero"><img src={image} alt="" loading="lazy" decoding="async"/><div className="workspace-page-hero-shade"/><div className="workspace-page-hero-copy"><div className="eyebrow"><span className="eyebrow-square"/> {eyebrow}</div><span className="workspace-page-icon"><Icon size={23}/></span><h1>{title}</h1><p>{desc}</p><div className="workspace-page-breadcrumb"><a href={getWorkspaceHref("overview")}>Workspace</a><span>/</span><span>{route.group}</span><span>/</span><strong>{route.label}</strong></div></div><div className="workspace-page-hero-actions"><a className="button-primary" href={getWorkspaceHref("runs",{focusTask:true})}><Sparkles size={14}/> New task</a><a className="button-outline" href={getWorkspaceHref("overview")}>Overview <ArrowUpRight size={13}/></a></div></section>
  <div className="workspace-page-metrics">{stats.map((metric)=><Metric key={metric.label} {...metric}/>)}</div>
  <div className="workspace-page-layout"><main className="workspace-page-main"><section className="panel-card workspace-page-primary"><div className="workspace-page-primary-heading"><div><div className="eyebrow">{route.group.toUpperCase()} / {route.kind.toUpperCase()}</div><h2>{route.kind==="agent"?"Role scope and hand-off":"Workspace view"}</h2><p>{route.kind==="agent"?"Inspect the specialist's mission and artifact contribution.":"This destination combines current workspace evidence with direct paths to the next useful action."}</p></div><Icon size={19}/></div><PageBody route={route} runs={runs} config={workspaceConfig} apiState={apiState} agents={agents} openRun={openRun} onSelectTemplate={onSelectTemplate}/></section>{content?.sections?.map((section)=><PageSection key={section.title} section={section}/>)}</main>
   <aside className="workspace-page-rail"><section className="panel-card workspace-page-rail-card"><div className="eyebrow">NEXT DESTINATIONS</div><h2>Keep moving</h2><p>Open a related page without returning to the dashboard.</p>{related.map((item)=><DestinationCard key={item.title} item={item}/>)}</section><section className="panel-card workspace-page-rail-card"><div className="eyebrow">RUNTIME READINESS</div><h2>{workspaceConfig?.can_start_runs?"Ready to launch":apiState==="connected"?"Setup required":"Connection unknown"}</h2><p>{workspaceConfig?.can_start_runs?"The API currently reports that workflow launch is enabled.":"Check provider, database, access and worker requirements before starting live work."}</p><a className="button-outline full-button" href={getWorkspaceHref("settings-runtime")}>Inspect runtime <ArrowRight size={13}/></a></section></aside>
  </div>
 </div>;
}
