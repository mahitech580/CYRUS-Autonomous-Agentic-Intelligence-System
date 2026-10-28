import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Boxes, Braces,
  Check, CheckCircle2, ChevronDown, CircleDot, Clock3, Code2, Command,
  Cpu, Database, FileCode2, GitBranch, GitCommitHorizontal, GitPullRequest,
  Globe2, LayoutDashboard, LifeBuoy, LockKeyhole, Menu, MoreHorizontal,
  Network, Play, Plus, Radio, Rocket, Search, Settings2, ShieldCheck,
  Sparkles, Terminal, Timer, Workflow, X, Zap
} from "lucide-react";
import { api } from "./lib/api.js";

const navigation = [
  { id: "Overview", icon: LayoutDashboard },
  { id: "Agent fleet", icon: Bot },
  { id: "Runs & tasks", icon: Workflow },
  { id: "Code review", icon: GitPullRequest },
  { id: "Deployments", icon: Rocket },
  { id: "Integrations", icon: Boxes },
];
const agents = [
  { id: "planner", name: "Atlas", role: "Planning agent", desc: "Breaks goals into executable milestones.", color: "violet", tag: "PLAN" },
  { id: "researcher", name: "Scout", role: "Research agent", desc: "Maps context, docs, risks and dependencies.", color: "blue", tag: "RESEARCH" },
  { id: "architect", name: "Forma", role: "Architecture agent", desc: "Defines boundaries, contracts and data flow.", color: "cyan", tag: "DESIGN" },
  { id: "coder", name: "Forge", role: "Coding agent", desc: "Builds implementation tasks from approved plans.", color: "lime", tag: "BUILD" },
  { id: "tester", name: "Sentinel", role: "QA agent", desc: "Checks acceptance criteria and regression risk.", color: "orange", tag: "TEST" },
  { id: "reviewer", name: "Lens", role: "Review agent", desc: "Audits quality, security and maintainability.", color: "pink", tag: "REVIEW" },
  { id: "release", name: "Orbit", role: "Release agent", desc: "Prepares release notes and deployment gates.", color: "green", tag: "SHIP" },
];
const pipeline = [
  { title: "Plan", sub: "Scope & acceptance", icon: Command, color: "violet" },
  { title: "Research", sub: "Context & sources", icon: Search, color: "blue" },
  { title: "Architect", sub: "Design & contracts", icon: Network, color: "cyan" },
  { title: "Code", sub: "Implementation", icon: Code2, color: "lime" },
  { title: "Test", sub: "Verify & regress", icon: ShieldCheck, color: "orange" },
  { title: "Review", sub: "Quality gates", icon: GitPullRequest, color: "pink" },
  { title: "Release", sub: "Ship safely", icon: Rocket, color: "green" },
];
const starterRuns = [
  { id: "RUN-042", goal: "Add streaming status events to the task console", status: "completed", progress: 100, time: "4 min ago", agents: 6, kind: "Feature build" },
  { id: "RUN-041", goal: "Harden API input validation and error boundaries", status: "running", progress: 68, time: "12 min ago", agents: 5, kind: "Reliability" },
  { id: "RUN-040", goal: "Review database adapter and migration strategy", status: "review", progress: 91, time: "38 min ago", agents: 4, kind: "Code review" },
];
const statusLabel = { completed: "Completed", running: "In progress", review: "Needs review", queued: "Queued", failed: "Failed" };

function StatusPill({ status }) {
  return <span className={"status-pill status-" + status}><span className="status-dot" />{statusLabel[status] || status}</span>;
}
function AgentAvatar({ agent, small = false }) {
  const Icon = agent.id === "tester" ? ShieldCheck : agent.id === "coder" ? Code2 : agent.id === "release" ? Rocket : agent.id === "architect" ? Network : agent.id === "researcher" ? Search : agent.id === "reviewer" ? GitPullRequest : Command;
  return <span className={"agent-avatar tone-" + agent.color + (small ? " avatar-small" : "")}><Icon size={small ? 14 : 17} strokeWidth={1.8} /></span>;
}
function SectionTitle({ eyebrow, title, detail, action }) {
  return <div className="section-title"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>{action}</div>;
}
function MiniBars() {
  return <div className="mini-bars" aria-label="Recent activity trend">{[31, 42, 35, 56, 43, 61, 48, 70, 58, 74, 53, 82, 62, 92, 71, 85, 66, 100, 77, 89, 72, 96].map((n, i) => <i key={i} style={{ height: n + "%" }} />)}</div>;
}
function AgentLine({ agent, state = "idle" }) {
  return <div className="agent-line"><AgentAvatar agent={agent} small /><div className="agent-line-copy"><strong>{agent.name}</strong><span>{agent.role}</span></div><span className={"agent-state state-" + state}><i />{state === "working" ? "Working" : state === "ready" ? "Ready" : "Standby"}</span></div>;
}
function RunRow({ run, onOpen }) {
  return <button className="run-row" onClick={() => onOpen(run)}><span className="run-id">{run.id}</span><span className="run-description"><strong>{run.goal}</strong><small>{run.kind || "Workflow"} <span>·</span> {run.agents || 4} agents <span>·</span> {run.time || "Just now"}</small></span><span className="run-progress-wrap"><span className="run-progress"><i style={{ width: (run.progress || 0) + "%" }} /></span><small>{run.progress || 0}%</small></span><StatusPill status={run.status} /><ArrowRight className="run-arrow" size={15} /></button>;
}

export default function App() {
  const [view, setView] = useState("Overview");
  const [runs, setRuns] = useState(starterRuns);
  const [goal, setGoal] = useState("");
  const [query, setQuery] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [apiState, setApiState] = useState("checking");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.health().then(() => {
      if (alive) setApiState("connected");
      return api.runs();
    }).then((data) => {
      if (alive && data && Array.isArray(data.items)) {
        setRuns(data.items.map((r) => ({ ...r, time: "From API", agents: r.agent_count || 7, kind: "Workspace run" })));
      }
    }).catch(() => { if (alive) setApiState("demo"); });
    return () => { alive = false; };
  }, []);

  const visibleRuns = useMemo(() => runs.filter((run) => {
    const needle = query.trim().toLowerCase();
    return !needle || [run.id, run.goal, run.status, run.kind].some((item) => String(item || "").toLowerCase().includes(needle));
  }), [runs, query]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }
  function addLocalRun(text) {
    const run = {
      id: "RUN-" + String(Date.now()).slice(-5),
      goal: text,
      status: "running",
      progress: 8,
      time: "Just now",
      agents: 7,
      kind: "New workflow",
    };
    setRuns((current) => [run, ...current]);
    let progress = 8;
    const timer = window.setInterval(() => {
      progress = Math.min(100, progress + 23);
      setRuns((current) => current.map((item) => item.id === run.id ? { ...item, progress, status: progress >= 100 ? "review" : "running" } : item));
      if (progress >= 100) {
        window.clearInterval(timer);
        notify("Workflow staged. Review the run output before release.");
      }
    }, 900);
  }
  async function startRun(event) {
    event?.preventDefault();
    const cleanGoal = goal.trim();
    if (!cleanGoal || isStarting) return;
    setIsStarting(true);
    try {
      if (apiState === "connected") {
        const result = await api.createRun(cleanGoal);
        const created = result.item || result;
        setRuns((current) => [{ ...created, id: created.id || "RUN-" + Date.now().toString().slice(-5), goal: created.goal || cleanGoal, status: created.status || "queued", progress: created.progress || 0, time: "Just now", agents: 7, kind: "API workflow" }, ...current]);
        notify("Run queued in the CYRUS API.");
      } else {
        addLocalRun(cleanGoal);
        notify("Demo workflow started. Connect the API for persistent runs.");
      }
      setGoal("");
      setView("Runs & tasks");
    } catch {
      addLocalRun(cleanGoal);
      setGoal("");
      setView("Runs & tasks");
      notify("API unavailable. Started an in-browser demo run.");
    } finally {
      setIsStarting(false);
    }
  }
  function openRun(run) {
    setSelectedRun(run);
  }

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (mobileNav ? " sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div className="brand-type"><strong>CYRUS<span>_</span></strong><small>ENGINEERING OS</small></div>
          <button className="icon-button close-mobile" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="workspace-switcher"><div className="workspace-glyph">C</div><div><strong>Cyrus workspace</strong><small>Personal sandbox</small></div><ChevronDown size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => <button key={item.id} className={"nav-item" + (view === item.id ? " nav-active" : "")} onClick={() => { setView(item.id); setMobileNav(false); }}><item.icon size={17} strokeWidth={1.8} /><span>{item.id}</span>{item.id === "Runs & tasks" ? <span className="nav-count">{runs.length}</span> : null}</button>)}
        </nav>
        <div className="nav-label nav-label-spaced">SYSTEM</div>
        <button className={"nav-item" + (view === "Settings" ? " nav-active" : "")} onClick={() => { setView("Settings"); setMobileNav(false); }}><Settings2 size={17} /><span>Settings</span></button>
        <div className="sidebar-spacer" />
        <div className="capacity-card">
          <div className="capacity-heading"><span>WORKSPACE CAPACITY</span><CircleDot size={13} /></div>
          <div className="capacity-value">07 <small>/ 12 agent slots</small></div>
          <div className="capacity-track"><i /></div>
          <div className="capacity-foot"><span>Fleet utilization</span><strong>58%</strong></div>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">M</div><div className="profile-copy"><strong>Workspace owner</strong><small>Developer plan · Local</small></div><MoreHorizontal size={18} />
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button open-mobile" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><span className="breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><strong>{view}</strong><span className="branch-chip"><GitBranch size={13} /> main</span></div>
          <div className="topbar-actions"><div className={"connection-pill connection-" + apiState}><i />{apiState === "connected" ? "API connected" : apiState === "checking" ? "Checking API" : "Demo mode"}</div><button className="icon-button" title="Command palette" onClick={() => document.getElementById("task-prompt")?.focus()}><Command size={17} /></button><button className="top-avatar" title="Workspace profile">M</button></div>
        </header>

        <div className="page-content">
          {view === "Overview" ? <Overview
            runs={visibleRuns} allRuns={runs} goal={goal} setGoal={setGoal} startRun={startRun}
            isStarting={isStarting} openRun={openRun} setView={setView} notify={notify} apiState={apiState}
          /> : null}
          {view === "Agent fleet" ? <FleetView notify={notify} apiState={apiState} /> : null}
          {view === "Runs & tasks" ? <RunsView runs={visibleRuns} query={query} setQuery={setQuery} openRun={openRun} goal={goal} setGoal={setGoal} startRun={startRun} isStarting={isStarting} /> : null}
          {view === "Code review" ? <ReviewView notify={notify} /> : null}
          {view === "Deployments" ? <DeploymentsView notify={notify} /> : null}
          {view === "Integrations" ? <IntegrationsView notify={notify} /> : null}
          {view === "Settings" ? <SettingsView apiState={apiState} setApiState={setApiState} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} notify={notify} /> : null}
        </div>
        <footer className="app-footer"><span><span className="footer-pulse" /> All systems nominal</span><span>CYRUS Workspace <b>0.1.0</b></span><span>Built for deliberate shipping <Zap size={12} /></span></footer>
      </main>

      {mobileNav ? <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay" /> : null}
      {toast ? <div className="toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div> : null}
      {selectedRun ? <RunDrawer run={selectedRun} onClose={() => setSelectedRun(null)} /> : null}
    </div>
  );
}

function Overview({ runs, allRuns, goal, setGoal, startRun, isStarting, openRun, setView, notify, apiState }) {
  const completed = allRuns.filter((run) => run.status === "completed").length;
  const active = allRuns.filter((run) => run.status === "running" || run.status === "queued").length;
  return <div className="view-stack">
    <div className="welcome-line"><div><div className="eyebrow"><span className="eyebrow-square" /> AUTONOMOUS ENGINEERING WORKSPACE <span className="eyebrow-slash">/ 001</span></div><h1>Build the future.<br /><em>One agent at a time.</em></h1><p className="hero-copy">A coordinated team for the messy middle of software engineering — from first idea to verified release.</p></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><Sparkles size={27} /></div><span className="orbit-node node-a" /><span className="orbit-node node-b" /><span className="orbit-node node-c" /><span className="orbit-label">AGENT<br />MESH</span></div></div>

    <form className="task-composer" onSubmit={startRun}>
      <div className="composer-top"><div className="composer-icon"><Sparkles size={17} /></div><div><strong>What are we building today?</strong><span>Describe an outcome. CYRUS will map the work into a reviewable pipeline.</span></div><span className="composer-shortcut">⌘ ↵</span></div>
      <textarea id="task-prompt" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Build a secure user authentication API with refresh tokens and integration tests…" rows={2} maxLength={1200} />
      <div className="composer-bottom"><div className="composer-context"><span><Braces size={13} /> Full-stack project</span><span><Database size={13} /> DB-aware</span><span><ShieldCheck size={13} /> Human review gates</span></div><button className="button-primary" type="submit" disabled={!goal.trim() || isStarting}>{isStarting ? "Starting…" : "Start workflow"}<ArrowRight size={15} /></button></div>
    </form>

    <div className="metrics-grid">
      <MetricCard label="WORKFLOWS RUN" value={String(allRuns.length).padStart(2, "0")} change="Across this workspace" icon={Workflow} trend="neutral" />
      <MetricCard label="ACTIVE EXECUTIONS" value={String(active).padStart(2, "0")} change={active ? "Agents are processing tasks" : "No active execution"} icon={Activity} trend="lime" />
      <MetricCard label="COMPLETED RUNS" value={String(completed).padStart(2, "0")} change="Review artifacts before release" icon={CheckCircle2} trend="blue" />
      <MetricCard label="AGENT FLEET" value="07" change="Specialists · staged pipeline" icon={Bot} trend="violet" />
    </div>

    <div className="section-divider"><span>ORCHESTRATION</span><span className="divider-line" /><span className="section-index">01 / 03</span></div>
    <section className="pipeline-section">
      <div className="section-title"><div><h2>From intent to impact</h2><p>One shared context. Seven focused roles. Explicit quality gates.</p></div><button className="button-quiet" onClick={() => setView("Agent fleet")}>Explore agent fleet <ArrowRight size={14} /></button></div>
      <div className="pipeline-track">{pipeline.map((step, index) => <div className="pipeline-step-wrap" key={step.title}><button className={"pipeline-step pipeline-" + step.color} onClick={() => index === 5 ? setView("Code review") : index === 6 ? setView("Deployments") : setView("Agent fleet")}><span className="pipeline-icon"><step.icon size={17} /></span><strong>{step.title}</strong><small>{step.sub}</small></button>{index < pipeline.length - 1 ? <span className="pipeline-connector"><ArrowRight size={14} /></span> : null}</div>)}</div>
      <div className="pipeline-foot"><span><span className="legend-dot legend-lime" /> Sequential hand-offs</span><span><span className="legend-dot legend-blue" /> Shared task context</span><button onClick={() => notify("Quality gates are enforced by the review stage before release.")}> <LockKeyhole size={12} /> Review gates enabled</button></div>
    </section>

    <div className="section-divider"><span>LIVE OPERATIONS</span><span className="divider-line" /><span className="section-index">02 / 03</span></div>
    <div className="operations-grid">
      <section className="panel-card runs-panel"><div className="panel-heading"><div><div className="eyebrow">EXECUTION STREAM</div><h2>Recent workflows</h2></div><button className="button-quiet" onClick={() => setView("Runs & tasks")}>View all <ArrowRight size={14} /></button></div>
        <div className="runs-table">{runs.slice(0, 4).map((run) => <RunRow run={run} key={run.id} onOpen={openRun} />)}</div>
        {runs.length === 0 ? <div className="empty-state"><Workflow size={24} /><strong>No workflows found</strong><span>Start a task to create the first run.</span></div> : null}
      </section>
      <section className="panel-card fleet-panel"><div className="panel-heading"><div><div className="eyebrow">AGENT TELEMETRY</div><h2>Fleet status</h2></div><button className="icon-button" onClick={() => setView("Agent fleet")} title="Open fleet"><ArrowUpRight size={16} /></button></div>
        <div className="fleet-summary"><div><span className="summary-number">07</span><span className="summary-label">Registered</span></div><div><span className="summary-number text-lime">03</span><span className="summary-label">On standby</span></div><div><span className="summary-number text-blue">{apiState === "connected" ? "API" : "SIM"}</span><span className="summary-label">Execution mode</span></div></div>
        <div className="agent-list">{agents.slice(0, 4).map((agent, i) => <AgentLine agent={agent} state={i === 1 ? "working" : i === 2 ? "ready" : "idle"} key={agent.id} />)}</div>
        <button className="button-outline full-button" onClick={() => setView("Agent fleet")}>Open agent registry <ArrowRight size={14} /></button>
      </section>
    </div>
    <div className="section-divider"><span>OBSERVABILITY</span><span className="divider-line" /><span className="section-index">03 / 03</span></div>
    <section className="observability-panel"><div className="observability-copy"><div className="eyebrow">WORKSPACE SIGNAL</div><h2>Momentum, in context.</h2><p>Track workflow volume and agent throughput. Metrics are illustrative until a backend is connected.</p><div className="signal-key"><span><i className="signal-green" /> Run activity</span><span><i className="signal-blue" /> Agent events</span></div></div><div className="observability-chart"><div className="chart-summary"><div><span>LAST 24 HOURS</span><strong>+18.6% <ArrowUpRight size={15} /></strong></div><div><span>EVENT RATE</span><strong>24.8 <small>/ min</small></strong></div></div><MiniBars /><div className="chart-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span></div></div></section>
  </div>;
}

function MetricCard({ label, value, change, icon: Icon, trend }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={"metric-icon metric-" + trend}><Icon size={16} /></span></div><div className="metric-value">{value}<span className="metric-value-mark">.</span></div><div className="metric-bottom"><span>{change}</span>{trend === "lime" ? <ArrowUpRight size={14} className="text-lime" /> : <ArrowDownRight size={14} />}</div></div>;
}
function FleetView({ notify, apiState }) {
  return <div className="view-stack subpage"><SectionTitle eyebrow="AGENT REGISTRY / 07 SPECIALISTS" title="The agent fleet" detail="Small, opinionated roles coordinated through explicit hand-offs." action={<button className="button-primary" onClick={() => notify("Custom agents are defined through backend agent adapters.")}><Plus size={15} /> Configure agent</button>} />
    <div className="fleet-banner"><div className="fleet-banner-icon"><Network size={22} /></div><div><strong>One system. Distinct responsibilities.</strong><p>Each agent gets a scoped job, a shared run context, and a clear hand-off contract. Human approval remains in the loop for release decisions.</p></div><div className="fleet-banner-status"><span className="footer-pulse" />{apiState === "connected" ? "API LINKED" : "SIMULATION"}<small>WORKSPACE MODE</small></div></div>
    <div className="agent-grid">{agents.map((agent, index) => <article className="agent-card" key={agent.id}><div className="agent-card-top"><AgentAvatar agent={agent} /><span className={"agent-tag tag-" + agent.color}>{agent.tag}</span><button className="icon-button" onClick={() => notify(agent.name + " is configured with the " + agent.role.toLowerCase() + " contract.")} aria-label={"Agent details for " + agent.name}><MoreHorizontal size={17} /></button></div><h3>{agent.name}</h3><div className="agent-role">{agent.role}</div><p>{agent.desc}</p><div className="agent-card-bottom"><span className="agent-state state-ready"><i /> Registered</span><span className="agent-model">CYRUS / {String(index + 1).padStart(2, "0")}</span></div></article>)}</div>
    <div className="notice-strip"><ShieldCheck size={17} /><span><strong>Guardrail:</strong> agents prepare artifacts and recommendations; sensitive operations require explicit human approval.</span></div>
  </div>;
}
function RunsView({ runs, query, setQuery, openRun, goal, setGoal, startRun, isStarting }) {
  return <div className="view-stack subpage"><SectionTitle eyebrow="EXECUTION CONTROL / RUN HISTORY" title="Runs & tasks" detail="Inspect orchestration state, progress, and review hand-offs." action={<span className="small-counter">{runs.length} VISIBLE RUNS</span>} />
    <form className="task-composer compact-composer" onSubmit={startRun}><div className="composer-icon"><Sparkles size={16} /></div><input aria-label="New workflow goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Describe a new engineering task…" /><button className="button-primary" disabled={!goal.trim() || isStarting}>{isStarting ? "Starting…" : "New run"}<ArrowRight size={14} /></button></form>
    <div className="list-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search workflows" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs, goals, or status…" /></div><div className="filter-chip"><CircleDot size={13} /> All statuses <ChevronDown size={13} /></div><button className="button-outline" onClick={() => setQuery("")}>Clear filters <X size={13} /></button></div>
    <section className="panel-card"><div className="table-head"><span>RUN / GOAL</span><span>PROGRESS</span><span>STATUS</span><span /></div><div className="runs-table large-runs">{runs.map((run) => <RunRow key={run.id} run={run} onOpen={openRun} />)}</div>{runs.length === 0 ? <div className="empty-state"><Search size={22} /><strong>No matching runs</strong><span>Try a different search or clear the filters.</span></div> : null}</section>
  </div>;
}
function ReviewView({ notify }) {
  const [checks, setChecks] = useState([true, true, false, false]);
  const items = ["Acceptance criteria mapped to tests", "Input validation and failure paths considered", "Secrets and configuration checked", "Human sign-off recorded"];
  return <div className="view-stack subpage"><SectionTitle eyebrow="QUALITY GATES / HUMAN IN THE LOOP" title="Code review" detail="A deliberate gate between agent output and release." action={<StatusPill status="review" />} />
    <div className="review-layout"><section className="panel-card review-main"><div className="panel-heading"><div><div className="eyebrow">PROPOSED CHANGESET</div><h2>API task orchestration</h2></div><span className="tag-soft">Preview diff</span></div><div className="diff-file"><FileCode2 size={15} /><strong>backend/cyrus/orchestrator.py</strong><span>+24 <b>−6</b></span></div><div className="code-preview"><div className="code-line"><span>01</span><code><i>async def</i> execute_workflow(run_id, context):</code></div><div className="code-line code-add"><span>02</span><code>+ plan = await planner.create_plan(context)</code></div><div className="code-line code-add"><span>03</span><code>+ await events.publish("plan.ready", plan)</code></div><div className="code-line"><span>04</span><code>  <i>for</i> stage <i>in</i> plan.stages:</code></div><div className="code-line code-add"><span>05</span><code>+     <i>await</i> guardrails.validate(stage)</code></div><div className="code-line"><span>06</span><code>      <i>await</i> execute_stage(stage, context)</code></div><div className="code-line code-remove"><span>07</span><code>− return result.status</code></div><div className="code-line code-add"><span>08</span><code>+ return WorkflowResult.from_context(context)</code></div></div><div className="diff-caption"><span><i className="diff-green" /> Added lines</span><span><i className="diff-red" /> Removed lines</span><span>Illustrative preview — not a live repository diff</span></div></section>
    <section className="panel-card review-checklist"><div className="eyebrow">REVIEW CHECKLIST</div><h2>Ready to merge?</h2><p>Verify the essentials before approving a proposed release.</p><div className="checklist-items">{items.map((item, i) => <label className="checklist-item" key={item}><input type="checkbox" checked={checks[i]} onChange={(e) => setChecks((old) => old.map((v, j) => i === j ? e.target.checked : v))} /><span className="checkmark"><Check size={12} /></span><span>{item}</span></label>)}</div><div className="checklist-progress"><div><span>Review coverage</span><strong>{checks.filter(Boolean).length} / {checks.length}</strong></div><div className="capacity-track"><i style={{ width: (checks.filter(Boolean).length / checks.length * 100) + "%" }} /></div></div><button className="button-primary full-button" onClick={() => notify(checks.every(Boolean) ? "Checklist complete. Human approval is still required in the release environment." : "Complete every review item before requesting approval.")}>Request approval <ArrowRight size={14} /></button></section></div>
    <div className="notice-strip"><LockKeyhole size={17} /><span><strong>Safe by default:</strong> the review screen is a prototype workflow gate, not a claim that real code has been inspected or merged.</span></div>
  </div>;
}
function DeploymentsView({ notify }) {
  return <div className="view-stack subpage"><SectionTitle eyebrow="RELEASE ENGINEERING / ENVIRONMENTS" title="Deployments" detail="Make releases visible, reviewable, and reversible." action={<button className="button-outline" onClick={() => notify("Deployment providers can be connected through environment-specific adapters.")}><Plus size={14} /> Add environment</button>} />
    <div className="environment-grid"><EnvironmentCard name="Development" slug="cyrus-dev" state="running" description="Local API and Vite frontend" accent="lime" onAction={notify} /><EnvironmentCard name="Staging" slug="staging / not connected" state="disconnected" description="Pre-release validation gate" accent="blue" onAction={notify} /><EnvironmentCard name="Production" slug="production / not connected" state="locked" description="Human-approved release target" accent="violet" onAction={notify} /></div>
    <section className="panel-card release-panel"><div className="panel-heading"><div><div className="eyebrow">RELEASE CHECKLIST</div><h2>Ship with confidence</h2></div><span className="tag-soft">Policy v1</span></div><div className="release-steps">{[{n:"01",title:"Validate the build",sub:"Build and API checks must pass.",done:true},{n:"02",title:"Review the changeset",sub:"A reviewer must accept the diff.",done:false},{n:"03",title:"Confirm environment config",sub:"Secrets and database URLs stay server-side.",done:false},{n:"04",title:"Approve release",sub:"Final action requires a human confirmation.",done:false}].map((step) => <div className="release-step" key={step.n}><span className={"release-num" + (step.done ? " release-done" : "")}>{step.done ? <Check size={14} /> : step.n}</span><div><strong>{step.title}</strong><small>{step.sub}</small></div><span className={step.done ? "done-label" : "pending-label"}>{step.done ? "PASSED" : "PENDING"}</span></div>)}</div></section>
  </div>;
}
function EnvironmentCard({ name, slug, state, description, accent, onAction }) {
  const label = state === "running" ? "Available" : state === "locked" ? "Approval required" : "Not connected";
  return <article className="environment-card"><div className="environment-top"><span className={"environment-icon env-" + accent}><Globe2 size={19} /></span><span className={"environment-state env-state-" + state}><i />{label}</span></div><h3>{name}</h3><p>{description}</p><div className="environment-slug">{slug}</div><button className="button-outline full-button" onClick={() => onAction(state === "running" ? name + " environment is available in local development." : "Connect " + name.toLowerCase() + " with your deployment provider before shipping.")}>{state === "running" ? "View environment" : state === "locked" ? "Review release policy" : "Connect environment"}<ArrowRight size={13} /></button></article>;
}
function IntegrationsView({ notify }) {
  const integrations = [
    { icon: Code2, name: "GitHub", group: "Source control", desc: "Repositories, pull requests, and branch checks.", status: "Setup guide", color: "plain" },
    { icon: Database, name: "PostgreSQL", group: "Relational database", desc: "Durable run records and future workflow artifacts.", status: "Supported", color: "blue" },
    { icon: Database, name: "MySQL", group: "Relational database", desc: "Alternative SQLAlchemy-backed persistence.", status: "Supported", color: "orange" },
    { icon: Cpu, name: "Model provider", group: "AI / ML runtime", desc: "Plug a provider adapter into the agent contract.", status: "Adapter point", color: "violet" },
    { icon: Radio, name: "Event stream", group: "Observability", desc: "Extend the API with SSE for live stage updates.", status: "Roadmap", color: "green" },
    { icon: Terminal, name: "CI pipeline", group: "Automation", desc: "Build, test, and package checks on each push.", status: "Included", color: "cyan" },
  ];
  return <div className="view-stack subpage"><SectionTitle eyebrow="CONNECTORS / RUNTIME CAPABILITIES" title="Integrations" detail="Keep providers replaceable. Core orchestration should not depend on one vendor." action={<button className="button-primary" onClick={() => notify("Integration registry is ready for adapter configuration.")}><Plus size={14} /> Add integration</button>} />
    <div className="integration-grid">{integrations.map((item) => <article className="integration-card" key={item.name}><div className="integration-top"><span className={"integration-icon integration-" + item.color}><item.icon size={18} /></span><span className="tag-soft">{item.status}</span></div><div className="integration-group">{item.group}</div><h3>{item.name}</h3><p>{item.desc}</p><button className="integration-link" onClick={() => notify(item.name + ": " + item.desc)}>View integration <ArrowRight size={13} /></button></article>)}</div>
    <div className="notice-strip"><Database size={17} /><span><strong>Credentials:</strong> configure database URLs and provider API keys through environment variables. Never commit secrets or send them to the browser.</span></div>
  </div>;
}
function SettingsView({ apiState, setApiState, settingsOpen, setSettingsOpen, notify }) {
  const [workspaceName, setWorkspaceName] = useState("Cyrus workspace");
  const [reviewGate, setReviewGate] = useState(true);
  const [demoTelemetry, setDemoTelemetry] = useState(true);
  return <div className="view-stack subpage"><SectionTitle eyebrow="WORKSPACE CONTROL / PREFERENCES" title="Settings" detail="Tune workspace behavior and review how the local prototype is running." />
    <div className="settings-layout"><section className="panel-card settings-card"><div className="panel-heading"><div><div className="eyebrow">GENERAL</div><h2>Workspace profile</h2></div><Settings2 size={18} /></div><label className="form-field"><span>Workspace name</span><input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><div className="setting-row"><div><strong>Human review gates</strong><p>Require review before release actions.</p></div><button className={"toggle " + (reviewGate ? "toggle-on" : "")} role="switch" aria-checked={reviewGate} onClick={() => setReviewGate(!reviewGate)}><i /></button></div><div className="setting-row"><div><strong>Demo telemetry</strong><p>Display illustrative activity when no API is connected.</p></div><button className={"toggle " + (demoTelemetry ? "toggle-on" : "")} role="switch" aria-checked={demoTelemetry} onClick={() => setDemoTelemetry(!demoTelemetry)}><i /></button></div><button className="button-primary" onClick={() => notify("Workspace settings saved in this browser session.")}>Save preferences <Check size={14} /></button></section>
    <section className="panel-card settings-card"><div className="panel-heading"><div><div className="eyebrow">RUNTIME</div><h2>Connection status</h2></div><Activity size={18} /></div><div className="runtime-status"><span className={"runtime-status-icon " + (apiState === "connected" ? "runtime-good" : "runtime-demo")}><Radio size={18} /></span><div><strong>{apiState === "connected" ? "CYRUS API connected" : "Local demo runtime"}</strong><p>{apiState === "connected" ? "Tasks can be persisted by the Python backend." : "The dashboard remains interactive without a running API."}</p></div></div><div className="setting-row"><div><strong>Execution behavior</strong><p>Choose whether this session uses the live API.</p></div><span className="tag-soft">{apiState === "connected" ? "LIVE API" : "IN-BROWSER"}</span></div><button className="button-outline full-button" onClick={() => { setSettingsOpen(!settingsOpen); notify(settingsOpen ? "Runtime details hidden." : "Runtime uses VITE_API_BASE_URL, defaulting to localhost:8000."); }}>{settingsOpen ? "Hide runtime details" : "Show runtime details"}<ArrowRight size={13} /></button>{settingsOpen ? <div className="runtime-details"><div><span>FRONTEND</span><code>React + Vite</code></div><div><span>API</span><code>FastAPI · localhost:8000</code></div><div><span>PERSISTENCE</span><code>SQLAlchemy / SQLite default</code></div><div><span>DATABASE OPTIONS</span><code>PostgreSQL · MySQL</code></div></div> : null}</section></div>
  </div>;
}
function RunDrawer({ run, onClose }) {
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Workflow details"><button className="drawer-backdrop" onClick={onClose} aria-label="Close run details" /><aside className="run-drawer"><div className="drawer-head"><div><div className="eyebrow">WORKFLOW DETAILS</div><span className="run-id">{run.id}</span></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></div><h2>{run.goal}</h2><StatusPill status={run.status} /><div className="drawer-progress"><div><span>Execution progress</span><strong>{run.progress || 0}%</strong></div><div className="capacity-track"><i style={{ width: (run.progress || 0) + "%" }} /></div></div><div className="drawer-meta"><div><span>WORKFLOW TYPE</span><strong>{run.kind || "Agent workflow"}</strong></div><div><span>AGENT PARTICIPANTS</span><strong>{run.agents || 7} specialists</strong></div><div><span>CREATED</span><strong>{run.time || "Recently"}</strong></div><div><span>EXECUTION MODE</span><strong>Deterministic prototype</strong></div></div><div className="drawer-section-title">Pipeline hand-offs</div><div className="drawer-timeline">{pipeline.map((step, index) => <div className="timeline-item" key={step.title}><span className={"timeline-dot" + (index < Math.round((run.progress || 0) / 100 * pipeline.length) ? " timeline-done" : "")}>{index < Math.round((run.progress || 0) / 100 * pipeline.length) ? <Check size={11} /> : index + 1}</span><div><strong>{step.title}</strong><small>{index < Math.round((run.progress || 0) / 100 * pipeline.length) ? "Stage preview prepared" : "Waiting for previous stage"}</small></div></div>)}</div><div className="drawer-note"><LifeBuoy size={15} /><span>In this starter build, stage outputs are simulated unless a model/provider adapter is configured.</span></div><button className="button-primary full-button" onClick={onClose}>Close run details <Check size={14} /></button></aside></div>;
}