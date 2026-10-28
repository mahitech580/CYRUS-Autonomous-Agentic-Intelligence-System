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
          {view === "Code review" ? <ReviewView runs={runs} openRun={openRun} notify={notify} /> : null}
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
function ReviewView({ runs = [], openRun, notify }) {
  const pending = runs.filter((run) => run.status === "review");
  const withArtifacts = runs.filter((run) => Array.isArray(run.stages) && run.stages.length > 0).slice(0, 8);
  return <div className="view-stack subpage">
    <SectionTitle eyebrow="QUALITY GATES / HUMAN IN THE LOOP" title="Code review" detail="Review actual saved workflow output. Open a run to inspect every agent artifact and record a decision." action={<span className="tag-soft">{pending.length} awaiting decision</span>} />
    <section className="panel-card review-main">
      <div className="panel-heading"><div><div className="eyebrow">PENDING APPROVALS</div><h2>Needs your review</h2><p>Only persisted workflows with a pending review state appear here.</p></div><span className={pending.length ? "status-pill status-review" : "tag-soft"}>{pending.length ? "Action required" : "All clear"}</span></div>
      {pending.length ? <div className="runs-table">{pending.map((run) => <RunRow run={run} key={run.id} onOpen={openRun} />)}</div> : <div className="empty-state"><ShieldCheck size={25} /><strong>No pending reviews</strong><span>Completed real workflows will appear here when they reach the human approval gate.</span></div>}
    </section>
    <section className="panel-card review-main">
      <div className="panel-heading"><div><div className="eyebrow">SAVED OUTPUTS</div><h2>Recent workflow artifacts</h2><p>Open a saved run to read its planning, research, architecture, code proposal, tests, review and release notes.</p></div></div>
      {withArtifacts.length ? <div className="runs-table">{withArtifacts.map((run) => <RunRow run={run} key={run.id} onOpen={openRun} />)}</div> : <div className="empty-state"><FileCode2 size={25} /><strong>No saved artifacts yet</strong><span>Artifacts are created by real provider-backed workflows; sample diffs are not shown as live repository changes.</span></div>}
    </section>
    <div className="notice-strip"><LockKeyhole size={17} /><span><strong>Release safety:</strong> approval records a decision only. CYRUS does not execute generated code, commit artifacts to GitHub, or deploy a release.</span></div>
  </div>;
}
function DeploymentsView({ apiState, workspaceConfig }) {
  const providerReady = !!workspaceConfig?.provider_configured;
  const storageReady = !!workspaceConfig?.persistent_storage;
  const accessReady = !!workspaceConfig && (!workspaceConfig.auth_required || !!workspaceConfig.access_control_configured);
  const targets = [
    { name: "CYRUS workspace", eyebrow: "FRONTEND · VERCEL", description: "Open the deployed React workspace and verify the responsive operator console.", href: "https://cyrus-workspace-mahendra8.vercel.app", action: "Open workspace", icon: LayoutDashboard, state: "Deployed alias" },
    { name: "CYRUS API", eyebrow: "BACKEND · FASTAPI", description: "Inspect the documented API surface and use the health endpoint to test reachability.", href: "https://cyrus-api-mahendra8.vercel.app/docs", action: "Open API docs", icon: Terminal, state: apiState === "connected" ? "API reachable from this session" : "Reachability not confirmed" },
    { name: "Source and release checks", eyebrow: "SOURCE CONTROL · GITHUB", description: "Review the code on main and inspect build/test results before promoting changes.", href: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions", action: "Open CI runs", icon: GitBranch, state: "main branch" },
  ];
  const gates = [
    { title: "Frontend and API", detail: "The workspace must reach the backend.", ready: apiState === "connected" },
    { title: "Model credentials", detail: "A valid provider key must be configured server-side.", ready: providerReady },
    { title: "Durable database", detail: "Production workflows need managed PostgreSQL or MySQL.", ready: storageReady },
    { title: "Workspace access", detail: "Production write/action routes must stay protected.", ready: accessReady },
  ];
  return <div className="view-stack subpage">
    <SectionTitle eyebrow="RELEASE ENGINEERING / DEPLOYED TARGETS" title="Deployments" detail="Inspect the actual workspace, API and CI resources. CYRUS never reports a release as complete merely because a card or checklist exists." action={<a className="button-outline external-button" href="https://vercel.com/mahendra8/cyrus-workspace" target="_blank" rel="noreferrer">Vercel project <ArrowUpRight size={14} /></a>} />
    <div className="deployment-resource-grid">{targets.map((target) => <article className="deployment-resource-card" key={target.name}>
      <div className="deployment-resource-top"><span className="deployment-resource-icon"><target.icon size={18} /></span><span className="deployment-eyebrow">{target.eyebrow}</span></div>
      <h3>{target.name}</h3><p>{target.description}</p><div className="deployment-resource-state"><i className={target.name === "CYRUS API" && apiState === "connected" ? "deployment-live-dot" : ""} />{target.state}</div>
      <a className="button-outline full-button external-button" href={target.href} target="_blank" rel="noreferrer">{target.action}<ArrowUpRight size={14} /></a>
    </article>)}</div>
    <section className="panel-card release-panel"><div className="panel-heading"><div><div className="eyebrow">PRODUCTION READINESS</div><h2>Configuration gates</h2><p>These checks reflect current API configuration, not simulated deployment events.</p></div></div>
      <div className="release-steps">{gates.map((gate,index) => <div className="release-step" key={gate.title}><span className={"release-num" + (gate.ready ? " release-done" : "")}>{gate.ready ? <Check size={14} /> : String(index+1).padStart(2,"0")}</span><div><strong>{gate.title}</strong><small>{gate.detail}</small></div><span className={gate.ready ? "done-label" : "pending-label"}>{gate.ready ? "READY" : "NEEDS SETUP"}</span></div>)}</div>
      <a className="settings-link" href="https://vercel.com/mahendra8/cyrus-api/settings/environment-variables" target="_blank" rel="noreferrer">Configure server environment variables <ArrowUpRight size={13} /></a>
    </section>
    <div className="notice-strip"><ShieldCheck size={17} /><span><strong>No automatic release:</strong> repository writes and production deployment adapters are not connected to the agent pipeline. Review the source and CI result before shipping any new build.</span></div>
  </div>;
}
function EnvironmentCard({ name, slug, state, description, accent, onAction }) {
  const label = state === "running" ? "Available" : state === "locked" ? "Approval required" : "Not connected";
  return <article className="environment-card"><div className="environment-top"><span className={"environment-icon env-" + accent}><Globe2 size={19} /></span><span className={"environment-state env-state-" + state}><i />{label}</span></div><h3>{name}</h3><p>{description}</p><div className="environment-slug">{slug}</div><button className="button-outline full-button" onClick={() => onAction(state === "running" ? name + " environment is available in local development." : "Connect " + name.toLowerCase() + " with your deployment provider before shipping.")}>{state === "running" ? "View environment" : state === "locked" ? "Review release policy" : "Connect environment"}<ArrowRight size={13} /></button></article>;
}
function IntegrationsView({ notify }) {
  const integrations = [
    { icon: Code2, name: "GitHub", group: "Source control", desc: "Main branch, source files and automated build/test checks.", status: "Repository", color: "plain", href: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System" },
    { icon: Database, name: "PostgreSQL", group: "Relational database", desc: "Use managed PostgreSQL with SQLAlchemy for durable workflow and artifact records.", status: "Adapter supported", color: "blue", href: "https://supabase.com/docs/guides/database/connecting-to-postgres" },
    { icon: Database, name: "MySQL", group: "Relational database", desc: "Alternative SQLAlchemy dialect for a managed production database.", status: "Adapter supported", color: "orange", href: "https://docs.sqlalchemy.org/en/20/dialects/mysql.html" },
    { icon: Cpu, name: "AI model provider", group: "AI runtime", desc: "Server-side OpenAI Responses API integration with an OpenAI-compatible base URL option.", status: "Server adapter", color: "violet", href: "https://platform.openai.com/docs/api-reference/responses" },
    { icon: Radio, name: "Live event stream", group: "Observability", desc: "Current workflow details poll the API; a dedicated server-sent event stream is not connected.", status: "Not connected", color: "green", href: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events" },
    { icon: Workflow, name: "CI pipeline", group: "Build and test", desc: "GitHub Actions builds the frontend and runs the backend test suite on push.", status: "GitHub Actions", color: "cyan", href: "https://github.com/mahitech580/CYRUS-Autonomous-Agentic-Intelligence-System/actions" },
  ];
  return <div className="view-stack subpage"><SectionTitle eyebrow="CONNECTORS / RUNTIME CAPABILITIES" title="Integrations" detail="Follow real provider documentation and deployment controls. An integration marked supported describes code capability, not a connected account." action={<a className="button-primary external-button" href="https://vercel.com/mahendra8/cyrus-api/settings/environment-variables" target="_blank" rel="noreferrer">Configure runtime <ArrowUpRight size={14} /></a>} />
    <div className="integration-grid">{integrations.map((item) => <article className="integration-card" key={item.name}><div className="integration-top"><span className={"integration-icon integration-" + item.color}><item.icon size={18} /></span><span className="tag-soft">{item.status}</span></div><div className="integration-group">{item.group}</div><h3>{item.name}</h3><p>{item.desc}</p><a className="integration-link" href={item.href} target="_blank" rel="noreferrer">Open resource <ArrowUpRight size={13} /></a></article>)}</div>
    <div className="notice-strip"><Database size={17} /><span><strong>Credential safety:</strong> configure provider keys, access keys and database URLs through server-side environment variables. Never commit secrets or send them to the browser.</span></div>
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
