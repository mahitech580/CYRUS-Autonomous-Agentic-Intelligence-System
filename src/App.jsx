import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Boxes, Braces,
  Check, CheckCircle2, ChevronDown, CircleDot, Clock3, Code2, Command,
  Cpu, Database, FileCode2, GitBranch, GitCommitHorizontal, GitPullRequest,
  Globe2, LayoutDashboard, LifeBuoy, LockKeyhole, Menu, MoreHorizontal,
  Network, Play, Plus, Radio, Rocket, Search, Settings2, ShieldCheck,
  Sparkles, Terminal, Timer, Workflow, X, Zap
} from "lucide-react";
import { api, getAccessKey, setAccessKey } from "./lib/api.js";

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
const starterRuns = [];
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
function MiniBars({ runs = [] }) {
  const items = runs.slice(0, 12).reverse();
  if (!items.length) return <div className="chart-placeholder"><Activity size={17} /><span>Workflow telemetry will appear after the first run.</span></div>;
  return <div className="mini-bars" aria-label="Completion progress for recent workflows">{items.map((run, i) => {
    const value = Math.max(0, Math.min(100, Number(run.progress) || 0));
    return <i key={run.id || i} style={{ height: Math.max(5, value) + "%" }} title={(run.id || "Workflow") + ": " + value + "%"} />;
  })}</div>;
}
function AgentLine({ agent, state = "registered" }) {
  const label = state === "working" ? "Running" : state === "ready" ? "Ready" : "Registered";
  return <div className="agent-line"><AgentAvatar agent={agent} small /><div className="agent-line-copy"><strong>{agent.name}</strong><span>{agent.role}</span></div><span className={"agent-state state-" + state}><i />{label}</span></div>;
}
function RunRow({ run, onOpen }) {
  return <button className="run-row" onClick={() => onOpen(run)}><span className="run-id">{run.id}</span><span className="run-description"><strong>{run.goal}</strong><small>{run.kind || "Workflow"} <span>·</span> {run.agents || 4} agents <span>·</span> {run.time || "Just now"}</small></span><span className="run-progress-wrap"><span className="run-progress"><i style={{ width: (run.progress || 0) + "%" }} /></span><small>{run.progress || 0}%</small></span><StatusPill status={run.status} /><ArrowRight className="run-arrow" size={15} /></button>;
}

export default function App() {
  const [view, setView] = useState("Overview");
  const [runs, setRuns] = useState([]);
  const [goal, setGoal] = useState("");
  const [query, setQuery] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [apiState, setApiState] = useState("checking");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadWorkspace() {
      try {
        await api.health();
        const config = await api.config();
        if (!alive) return;
        setApiState("connected");
        setWorkspaceConfig(config);
        if (config.auth_required && !getAccessKey()) {
          setRuns([]);
          return;
        }
        try {
          const data = await api.runs();
          if (alive && Array.isArray(data.items)) setRuns(data.items.map(mapRunRecord));
        } catch (error) {
          if (![401, 503].includes(error.status)) notify(error.message || "Could not load workflow history.");
        }
      } catch {
        if (alive) setApiState("unavailable");
      }
    }
    loadWorkspace();
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
  async function startRun(event) {
    event?.preventDefault();
    const cleanGoal = goal.trim();
    if (!cleanGoal || isStarting) return;
    if (apiState !== "connected") {
      notify("The CYRUS API is unavailable. Check the deployment and try again.");
      setView("Settings");
      return;
    }
    if (!workspaceConfig?.can_start_runs) {
      const issue = !workspaceConfig?.access_control_configured && workspaceConfig?.auth_required
        ? "Configure CYRUS_ACCESS_KEY in the backend environment before using workspace actions."
        : !workspaceConfig?.provider_configured
          ? "Configure OPENAI_API_KEY in the backend environment to enable real AI runs."
          : "Configure persistent PostgreSQL or MySQL storage before creating production runs.";
      notify(issue);
      setView("Settings");
      return;
    }
    setIsStarting(true);
    try {
      const result = await api.createRun(cleanGoal);
      const created = mapRunRecord(result.item || result);
      setRuns((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setGoal("");
      setView("Runs & tasks");
      setSelectedRun(created);
      notify("Live AI workflow accepted. Follow the seven agent stages in run details.");
    } catch (error) {
      notify(error.message || "Could not start the workflow.");
      if (error.status === 401) setView("Settings");
    } finally {
      setIsStarting(false);
    }
  }
  function openRun(run) {
    setSelectedRun(run);
  }
  async function refreshSelectedRun(runId) {
    try {
      const response = await api.getRun(runId);
      if (response.item) {
        const fresh = mapRunRecord(response.item);
        setSelectedRun((current) => current?.id === runId ? fresh : current);
        setRuns((current) => current.map((item) => item.id === runId ? fresh : item));
      }
    } catch (error) {
      if (error.status === 401) notify("Workspace access key is missing or incorrect.");
    }
  }
  async function decideRun(decision, note = "") {
    if (!selectedRun || actionBusy) return;
    setActionBusy(true);
    try {
      const response = await api.approveRun(selectedRun.id, decision, note);
      const updated = mapRunRecord(response.item);
      setSelectedRun(updated);
      setRuns((current) => current.map((item) => item.id === updated.id ? updated : item));
      notify(decision === "approve" ? "Approval recorded. No deployment was triggered." : "Workflow rejected.");
    } catch (error) {
      notify(error.message || "Could not record the decision.");
    } finally {
      setActionBusy(false);
    }
  }
  async function cancelSelectedRun() {
    if (!selectedRun || actionBusy) return;
    setActionBusy(true);
    try {
      const response = await api.cancelRun(selectedRun.id);
      const updated = mapRunRecord(response.item);
      setSelectedRun(updated);
      setRuns((current) => current.map((item) => item.id === updated.id ? updated : item));
      notify("Cancellation recorded.");
    } catch (error) {
      notify(error.message || "Could not cancel the workflow.");
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedRun?.id || apiState !== "connected") return;
    let cancelled = false;
    let timer;
    const poll = async () => {
      await refreshSelectedRun(selectedRun.id);
      if (!cancelled) timer = window.setTimeout(poll, 2500);
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedRun?.id, apiState]);

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (mobileNav ? " sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div className="brand-type"><strong>CYRUS<span>_</span></strong><small>ENGINEERING OS</small></div>
          <button className="icon-button close-mobile" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="workspace-switcher"><div className="workspace-glyph">C</div><div><strong>Cyrus workspace</strong><small>{workspaceConfig?.can_start_runs ? "Production runtime" : apiState === "connected" ? "Setup required" : "Connecting runtime"}</small></div><ChevronDown size={15} /></div>
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
          <div className="profile-avatar">M</div><div className="profile-copy"><strong>Workspace owner</strong><small>Workspace environment</small></div><MoreHorizontal size={18} />
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button open-mobile" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><span className="breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><strong>{view}</strong><span className="branch-chip"><GitBranch size={13} /> main</span></div>
          <div className="topbar-actions"><div className={"connection-pill connection-" + (apiState === "connected" && workspaceConfig?.can_start_runs ? "connected" : apiState === "checking" ? "checking" : "demo")}><i />{apiState === "connected" ? (workspaceConfig?.can_start_runs ? "Live AI ready" : "Setup required") : apiState === "checking" ? "Checking API" : "API offline"}</div><button className="icon-button" title="Command palette" onClick={() => document.getElementById("task-prompt")?.focus()}><Command size={17} /></button><button className="top-avatar" title="Workspace profile">M</button></div>
        </header>

        <div className="page-content">
          {view === "Overview" ? <Overview
            runs={visibleRuns} allRuns={runs} goal={goal} setGoal={setGoal} startRun={startRun}
            isStarting={isStarting} canStart={!!workspaceConfig?.can_start_runs} openRun={openRun} setView={setView} notify={notify} apiState={apiState} workspaceConfig={workspaceConfig}
          /> : null}
          {view === "Agent fleet" ? <FleetView notify={notify} apiState={apiState} /> : null}
          {view === "Runs & tasks" ? <RunsView runs={visibleRuns} query={query} setQuery={setQuery} openRun={openRun} goal={goal} setGoal={setGoal} startRun={startRun} isStarting={isStarting} canStart={!!workspaceConfig?.can_start_runs} /> : null}
          {view === "Code review" ? <ReviewView notify={notify} /> : null}
          {view === "Deployments" ? <DeploymentsView notify={notify} /> : null}
          {view === "Integrations" ? <IntegrationsView notify={notify} /> : null}
          {view === "Settings" ? <SettingsView apiState={apiState} workspaceConfig={workspaceConfig} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} notify={notify} /> : null}
        </div>
        <footer className="app-footer"><span><span className={"footer-pulse footer-pulse-" + (apiState === "connected" ? (workspaceConfig?.can_start_runs ? "ready" : "setup") : apiState)} /> {apiState === "connected" ? (workspaceConfig?.can_start_runs ? "Runtime ready" : "Setup required") : apiState === "checking" ? "Checking runtime" : "API unavailable"}</span><span>CYRUS Workspace <b>0.1.0</b></span><span>Built for deliberate shipping <Zap size={12} /></span></footer>
      </main>

      {mobileNav ? <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay" /> : null}
      {toast ? <div className="toast"><CheckCircle2 size={17} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div> : null}
      {selectedRun ? <RunDrawer run={selectedRun} onClose={() => setSelectedRun(null)} onApprove={decideRun} onCancel={cancelSelectedRun} busy={actionBusy} /> : null}
    </div>
  );
}

function Overview({ runs, allRuns, goal, setGoal, startRun, isStarting, canStart, openRun, setView, notify, apiState, workspaceConfig }) {
  const completed = allRuns.filter((run) => run.status === "completed").length;
  const active = allRuns.filter((run) => run.status === "running" || run.status === "queued").length;
  return <div className="view-stack">
    <div className="welcome-line"><div><div className="eyebrow"><span className="eyebrow-square" /> AUTONOMOUS ENGINEERING WORKSPACE <span className="eyebrow-slash">/ 001</span></div><h1>Build the future.<br /><em>One agent at a time.</em></h1><p className="hero-copy">A coordinated team for the messy middle of software engineering — from first idea to verified release.</p></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><Sparkles size={27} /></div><span className="orbit-node node-a" /><span className="orbit-node node-b" /><span className="orbit-node node-c" /><span className="orbit-label">AGENT<br />MESH</span></div></div>

    {apiState !== "connected" || (workspaceConfig && !workspaceConfig.can_start_runs) ? <div className="setup-banner"><div className="setup-banner-icon"><ShieldCheck size={18} /></div><div><strong>{apiState !== "connected" ? "CYRUS API unavailable" : !workspaceConfig?.access_control_configured && workspaceConfig?.auth_required ? "Secure workspace access first" : !workspaceConfig?.provider_configured ? "Connect a real AI provider" : "Configure persistent storage"}</strong><p>{apiState !== "connected" ? "The live API is not reachable; CYRUS will not create simulated runs." : !workspaceConfig?.access_control_configured && workspaceConfig?.auth_required ? "Add CYRUS_ACCESS_KEY to cyrus-api in Vercel, then enter the same key in Settings." : !workspaceConfig?.provider_configured ? "Add OPENAI_API_KEY to the cyrus-api project's server environment variables. The secret stays server-side." : "Set DATABASE_URL to a managed PostgreSQL or MySQL database. Serverless SQLite is not durable."}</p></div><button type="button" className="button-outline" onClick={() => setView("Settings")}>Configure <ArrowRight size={13} /></button></div> : null}
    <form className="task-composer" onSubmit={startRun}>
      <div className="composer-top"><div className="composer-icon"><Sparkles size={17} /></div><div><strong>What are we building today?</strong><span>Describe an outcome. CYRUS will map the work into a reviewable pipeline.</span></div><span className="composer-shortcut">⌘ ↵</span></div>
      <textarea id="task-prompt" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Build a secure user authentication API with refresh tokens and integration tests…" rows={2} maxLength={1200} />
      <div className="composer-bottom"><div className="composer-context"><span><Braces size={13} /> Full-stack project</span><span><Database size={13} /> DB-aware</span><span><ShieldCheck size={13} /> Human review gates</span></div><button className="button-primary" type="submit" disabled={!goal.trim() || isStarting || !canStart}>{isStarting ? "Starting…" : "Start live workflow"}<ArrowRight size={15} /></button></div>
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
        <div className="fleet-summary"><div><span className="summary-number">07</span><span className="summary-label">Registered</span></div><div><span className="summary-number text-lime">07</span><span className="summary-label">Available roles</span></div><div><span className="summary-number text-blue">{apiState === "connected" ? "API" : "OFF"}</span><span className="summary-label">API status</span></div></div>
        <div className="agent-list">{agents.slice(0, 4).map((agent) => <AgentLine agent={agent} state="registered" key={agent.id} />)}</div>
        <button className="button-outline full-button" onClick={() => setView("Agent fleet")}>Open agent registry <ArrowRight size={14} /></button>
      </section>
    </div>
    <div className="section-divider"><span>OBSERVABILITY</span><span className="divider-line" /><span className="section-index">03 / 03</span></div>
    <section className="observability-panel"><div className="observability-copy"><div className="eyebrow">WORKSPACE SIGNAL</div><h2>Momentum, in context.</h2><p>Workflow counts and completion values below are derived from saved run records. No synthetic usage statistics are shown.</p><div className="signal-key"><span><i className="signal-green" /> Run progress</span><span><i className="signal-blue" /> Persisted runs</span></div></div><div className="observability-chart"><div className="chart-summary"><div><span>SAVED WORKFLOWS</span><strong>{String(allRuns.length).padStart(2, "0")}</strong></div><div><span>AVERAGE COMPLETION</span><strong>{allRuns.length ? Math.round(allRuns.reduce((sum, item) => sum + (Number(item.progress) || 0), 0) / allRuns.length) : 0}<small>%</small></strong></div></div><MiniBars runs={allRuns} /><div className="chart-axis"><span>OLDEST</span><span>RECENT</span></div></div></section>
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
function RunsView({ runs, query, setQuery, openRun, goal, setGoal, startRun, isStarting, canStart }) {
  return <div className="view-stack subpage"><SectionTitle eyebrow="EXECUTION CONTROL / RUN HISTORY" title="Runs & tasks" detail="Inspect orchestration state, progress, and review hand-offs." action={<span className="small-counter">{runs.length} VISIBLE RUNS</span>} />
    <form className="task-composer compact-composer" onSubmit={startRun}><div className="composer-icon"><Sparkles size={16} /></div><input aria-label="New workflow goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Describe a new engineering task…" /><button className="button-primary" disabled={!goal.trim() || isStarting || !canStart}>{isStarting ? "Starting…" : "New live run"}<ArrowRight size={14} /></button></form>{!canStart ? <div className="inline-help">Live runs require a configured model provider, protected workspace access, and persistent database. Open Settings for the exact missing requirements.</div> : null}
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
function SettingsView({ apiState, workspaceConfig, settingsOpen, setSettingsOpen, notify }) {
  const [accessKey, setAccessKeyState] = useState(getAccessKey());
  return <div className="view-stack subpage"><SectionTitle eyebrow="WORKSPACE CONTROL / RUNTIME CONFIGURATION" title="Settings" detail="Inspect live dependencies and connect the server-side services needed to run real agent workflows." />
    <div className="settings-layout">
      <section className="panel-card settings-card"><div className="panel-heading"><div><div className="eyebrow">SAFETY POLICY</div><h2>Execution boundaries</h2></div><ShieldCheck size={18} /></div>
        <div className="setting-row"><div><strong>Human review gate</strong><p>Every completed workflow pauses for a recorded approval decision. Approval does not deploy.</p></div><span className="tag-soft">ENFORCED</span></div>
        <div className="setting-row"><div><strong>Generated code execution</strong><p>Agent-generated code is saved as an artifact and is not executed on the API server.</p></div><span className="tag-soft">DISABLED</span></div>
        <div className="setting-row"><div><strong>Repository writes</strong><p>Git commits and pull requests are not made automatically. Connect a scoped, reviewable repository adapter before enabling writes.</p></div><span className="tag-soft">DISABLED</span></div>
        <div className="notice-strip"><LockKeyhole size={16} /><span>Provider credentials and database URLs belong in server-side environment variables, never frontend code.</span></div>
        <a className="settings-link" href="https://vercel.com/mahendra8/cyrus-api/settings/environment-variables" target="_blank" rel="noreferrer">Open API environment settings <ArrowUpRight size={13} /></a>
      </section>
      <section className="panel-card settings-card"><div className="panel-heading"><div><div className="eyebrow">RUNTIME</div><h2>Connection status</h2></div><Activity size={18} /></div>
        <div className="runtime-status"><span className={"runtime-status-icon " + (apiState === "connected" ? "runtime-good" : "runtime-demo")}><Radio size={18} /></span><div><strong>{apiState === "connected" ? "CYRUS API reachable" : "CYRUS API unavailable"}</strong><p>{apiState === "connected" ? "Provider and storage readiness are reported separately below." : "Check the API deployment and VITE_API_BASE_URL."}</p></div></div>
        <div className="runtime-details runtime-checks">
          <div><span>MODEL PROVIDER</span><code>{workspaceConfig?.provider_configured ? (workspaceConfig.model || "Configured") : "OPENAI_API_KEY missing"}</code></div>
          <div><span>PERSISTENT DATABASE</span><code>{workspaceConfig?.persistent_storage ? (workspaceConfig.database_dialect || "Configured") : "PostgreSQL / MySQL required"}</code></div>
          <div><span>ACCESS CONTROL</span><code>{workspaceConfig?.auth_required ? (workspaceConfig?.access_control_configured ? "Protected" : "CYRUS_ACCESS_KEY missing") : "Local development"}</code></div>
          <div><span>EXECUTION MODE</span><code>{workspaceConfig?.execution_mode || "API offline"}</code></div>
          <div><span>LIVE WEB RESEARCH</span><code>{workspaceConfig?.web_search_enabled ? "Enabled for Scout" : "Not enabled"}</code></div>
        </div>
        <label className="form-field access-key-field"><span>Workspace access key (stored for this browser session only)</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(e) => setAccessKeyState(e.target.value)} placeholder="Paste the server's CYRUS_ACCESS_KEY" /></label>
        <button className="button-primary full-button" onClick={() => { setAccessKey(accessKey); window.location.reload(); }}>Save access key and reconnect <ArrowRight size={13} /></button>
        <button className="button-outline full-button" onClick={() => { setSettingsOpen(!settingsOpen); notify(settingsOpen ? "Runtime details hidden." : "Runtime details expanded."); }}>{settingsOpen ? "Hide runtime details" : "Show runtime details"}<ArrowRight size={13} /></button>
        {settingsOpen ? <div className="runtime-details"><div><span>FRONTEND</span><code>React + Vite</code></div><div><span>API</span><code>FastAPI · configured URL</code></div><div><span>LOCAL PERSISTENCE</span><code>SQLite for development</code></div><div><span>PRODUCTION PERSISTENCE</span><code>Managed PostgreSQL / MySQL</code></div><div><span>MODEL API</span><code>OpenAI Responses API compatible</code></div></div> : null}
      </section>
    </div>
  </div>;
}
function mapRunRecord(run) {
  const dateValue = run.updated_at || run.created_at;
  let time = "Just now";
  if (dateValue) {
    try { time = new Date(dateValue).toLocaleString(); } catch { time = String(dateValue); }
  }
  return { ...run, time, agents: run.agent_count || 7, kind: run.execution_mode === "live-model" ? "Live AI workflow" : run.execution_mode || "Workflow" };
}

function RunDrawer({ run, onClose, onApprove, onCancel, busy }) {
  const stages = Array.isArray(run.stages) ? run.stages : [];
  const [expandedStage, setExpandedStage] = useState(stages.length ? stages[stages.length - 1].id : "plan");
  const [note, setNote] = useState("");
  const completedTokens = stages.reduce((sum, stage) => sum + (stage.usage?.input_tokens || 0) + (stage.usage?.output_tokens || 0), 0);
  function exportReport() {
    const report = [
      "# CYRUS workflow report", "",
      "**Run:** " + run.id,
      "**Status:** " + run.status,
      "**Goal:** " + run.goal,
      "**Execution mode:** " + (run.execution_mode || "unknown"), "",
      ...stages.flatMap((stage) => ["## " + stage.agent + " — " + stage.id, "", stage.output || stage.summary || "(No output saved)", ""]),
      "## Event log", "",
      ...(run.events || []).map((event) => "- [" + event.status + "] " + event.at + " — " + event.agent + ": " + event.message),
    ].join("\n");
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cyrus-" + run.id.toLowerCase() + "-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Workflow details"><button className="drawer-backdrop" onClick={onClose} aria-label="Close run details" /><aside className="run-drawer">
    <div className="drawer-head"><div><div className="eyebrow">LIVE WORKFLOW / ARTIFACTS</div><span className="run-id">{run.id}</span></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></div>
    <h2>{run.goal}</h2><StatusPill status={run.status} />
    <div className="drawer-progress"><div><span>{run.current_stage ? "Current stage · " + run.current_stage : "Execution progress"}</span><strong>{run.progress || 0}%</strong></div><div className="capacity-track"><i style={{ width: (run.progress || 0) + "%" }} /></div></div>
    <div className="drawer-meta"><div><span>WORKFLOW TYPE</span><strong>{run.kind || "Agent workflow"}</strong></div><div><span>AGENT STAGES</span><strong>{stages.length} / 7 completed</strong></div><div><span>UPDATED</span><strong>{run.time || "Recently"}</strong></div><div><span>MODEL USAGE</span><strong>{completedTokens.toLocaleString()} tokens</strong></div></div>
    {run.error ? <div className="run-error"><strong>Workflow failed</strong><p>{run.error}</p></div> : null}
    <div className="drawer-section-title">Generated agent artifacts</div>
    <div className="drawer-timeline">{pipeline.map((step, index) => {
      const stageId = step.title.toLowerCase();
      const stage = stages.find((item) => item.id === stageId);
      const active = run.current_stage === stageId;
      const complete = !!stage;
      return <div className="timeline-item" key={step.title}>
        <span className={"timeline-dot" + (complete ? " timeline-done" : active ? " timeline-active" : "")}>{complete ? <Check size={11} /> : active ? <Activity size={11} /> : index + 1}</span>
        <div className="timeline-stage"><button className="timeline-stage-button" onClick={() => setExpandedStage(expandedStage === stageId ? "" : stageId)}><strong>{step.title} <span>{stage?.agent || step.title}</span></strong><small>{stage ? "Real model output saved" : active ? "Waiting for provider response" : run.status === "failed" ? "Not completed" : "Queued"}</small></button>
          {expandedStage === stageId && stage ? <div className="artifact-output"><div className="artifact-label">MODEL OUTPUT</div><pre>{stage.output || stage.summary || "No output available."}</pre></div> : null}
        </div>
      </div>;
    })}</div>
    {run.status === "review" ? <div className="approval-panel"><div className="eyebrow">HUMAN REVIEW REQUIRED</div><strong>Approve the workflow artifacts?</strong><p>Approval records your decision only. It does not execute generated code, write to GitHub, or deploy a release.</p><label className="form-field"><span>Review note (optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What did you verify?" /></label><div className="approval-actions"><button className="button-outline" disabled={busy} onClick={() => onApprove("reject", note)}>Reject artifacts</button><button className="button-primary" disabled={busy} onClick={() => onApprove("approve", note)}>{busy ? "Saving…" : "Approve artifacts"}<Check size={14} /></button></div></div> : null}
    {["queued", "running"].includes(run.status) ? <button className="button-outline full-button" disabled={busy} onClick={onCancel}>Cancel workflow <X size={14} /></button> : null}
    <button className="button-outline full-button" onClick={exportReport}><FileCode2 size={14} /> Export complete Markdown report</button>
    <div className="drawer-note"><ShieldCheck size={15} /><span>Provider outputs are saved artifacts, not verified execution. Generated code is not run or committed by the server.</span></div>
    <button className="button-primary full-button" onClick={onClose}>Close run details <Check size={14} /></button>
  </aside></div>;
}
