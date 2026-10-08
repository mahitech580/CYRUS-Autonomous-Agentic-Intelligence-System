const {useEffect,useMemo,useState}=React

const API_TIMEOUT_MS=6500
const NAV_ITEMS=['Command','Agents','Memory','Tools','History']

async function apiJson(path,options={}){
  const method=(options.method||'GET').toUpperCase()
  const attempts=method==='GET'?2:1
  let lastError
  let retryDelayMs=180
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),API_TIMEOUT_MS)
    try{
      const res=await fetch(path,{...options,signal:controller.signal})
      const retryAfter=Number(res.headers.get('Retry-After'))
      retryDelayMs=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,3000):180
      const data=await res.json().catch(()=>({}))
      if(!res.ok)throw new Error(data.error||'CYRUS request failed')
      return data
    }catch(error){
      lastError=error
      if(attempt<attempts-1)await new Promise(resolve=>setTimeout(resolve,retryDelayMs))
    }finally{clearTimeout(timer)}
  }
  throw lastError||new Error('CYRUS request failed')
}

const seedObjective='Build a production-ready REST API for task management with JWT authentication, PostgreSQL persistence, request validation, structured error handling, logging, and automated tests.'

function App(){
  const [page,setPage]=useState('Command')
  const [mode,setMode]=useState('autonomous')
  const [prompt,setPrompt]=useState('')
  const [agents,setAgents]=useState([])
  const [tools,setTools]=useState([])
  const [tasks,setTasks]=useState([])
  const [task,setTask]=useState(null)
  const [busy,setBusy]=useState(false)
  const [toast,setToast]=useState('')
  const [selectedTask,setSelectedTask]=useState(null)
  const [runtimeState,setRuntimeState]=useState('CONNECTING')
  const [runtimeMetrics,setRuntimeMetrics]=useState(null)
  const [paletteOpen,setPaletteOpen]=useState(false)

  const notify=message=>{setToast(message);window.clearTimeout(window.__cyrusToastTimer);window.__cyrusToastTimer=window.setTimeout(()=>setToast(''),2500)}
  const loadBase=async()=>{
    try{
      const [health,a,t,h,m]=await Promise.all([apiJson('/api/health'),apiJson('/api/agents'),apiJson('/api/tools'),apiJson('/api/tasks'),apiJson('/api/metrics')])
      setRuntimeState(health.runtime==='browser-fallback'?'DEMO':'ONLINE')
      setAgents(a);setTools(t);setTasks(h);setRuntimeMetrics(m)
    }catch{
      setRuntimeState('OFFLINE');notify('CYRUS runtime is unreachable')
    }
  }
  const loadTask=async id=>{
    const data=await apiJson('/api/tasks/'+id);setTask(data);return data
  }
  useEffect(()=>{
    loadBase()
    const onOnline=()=>{setRuntimeState('CONNECTING');loadBase()}
    const onOffline=()=>setRuntimeState('OFFLINE')
    window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline)
    return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline)}
  },[])
  useEffect(()=>{
    const timer=window.setInterval(async()=>{
      try{setRuntimeMetrics(await apiJson('/api/metrics'));setRuntimeState(s=>s==='DEMO'?'DEMO':'ONLINE')}
      catch{setRuntimeState('OFFLINE')}
    },2500)
    return()=>window.clearInterval(timer)
  },[])
  useEffect(()=>{
    if(!task?.task_id||!busy)return
    const timer=window.setInterval(async()=>{
      try{
        const data=await loadTask(task.task_id)
        if(['COMPLETED','FAILED','CANCELLED','AWAITING_APPROVAL'].includes(data.status)){setBusy(false);window.clearInterval(timer);loadBase()}
      }catch{setBusy(false);window.clearInterval(timer)}
    },700)
    return()=>window.clearInterval(timer)
  },[task?.task_id,busy])
  useEffect(()=>{
    const onKey=e=>{
      const combo=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'
      if(combo){e.preventDefault();setPaletteOpen(v=>!v);return}
      if(e.key==='Escape')setPaletteOpen(false)
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])
  useEffect(()=>{
    const onMove=e=>{
      document.documentElement.style.setProperty('--mx',(e.clientX/window.innerWidth*100)+'%')
      document.documentElement.style.setProperty('--my',(e.clientY/window.innerHeight*100)+'%')
    }
    window.addEventListener('pointermove',onMove,{passive:true})
    return()=>window.removeEventListener('pointermove',onMove)
  },[])
  const execute=async()=>{
    const objective=(prompt||seedObjective).trim()
    if(!objective)return notify('Enter an engineering objective first')
    setBusy(true);setPrompt(objective)
    try{
      const key=(globalThis.crypto?.randomUUID?.()||('ui-'+Date.now()+'-'+Math.random().toString(36).slice(2))).slice(0,100)
      const data=await apiJson('/api/execute',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({prompt:objective,mode})})
      await loadTask(data.task_id);notify('Objective accepted by CYRUS')
    }catch(error){setBusy(false);notify(error.message||'Execution failed')}
  }
  const approveTask=async()=>{
    if(!task?.task_id)return
    try{await apiJson('/api/tasks/'+task.task_id+'/approve',{method:'POST'});notify('Release approval granted');setBusy(true);await loadTask(task.task_id)}
    catch(error){notify(error.message||'Approval failed')}
  }
  const cancelTask=async()=>{
    if(!task?.task_id)return
    try{await apiJson('/api/tasks/'+task.task_id+'/cancel',{method:'POST'});notify('Cancellation requested');await loadTask(task.task_id)}
    catch(error){notify(error.message||'Cancellation failed')}
  }
  const openTask=async taskOrId=>{
    const id=typeof taskOrId==='string'?taskOrId:taskOrId?.task_id
    if(!id)return notify('Execution record is missing a task ID')
    try{setSelectedTask(await loadTask(id))}catch(error){notify(error.message||'Unable to open execution')}
  }
  const go=next=>{setPage(next);setPaletteOpen(false);window.scrollTo({top:0,behavior:'smooth'})}

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span/></div><div><strong>CYRUS</strong><small>AGENTIC INTELLIGENCE</small></div></div>
      <nav className="nav" aria-label="Primary navigation">{NAV_ITEMS.map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>go(item)}><span className="num">0{i+1}</span><span className="label">{item}</span></button>)}</nav>
      <div className="side-foot"><span className="tiny-dot"/>RUNTIME READY<br/>CYRUS CORE 1.0<br/>FASTAPI SIGNAL BRIDGE</div>
    </aside>
    <main className="main">
      <div className="topbar">
        <div className="eyebrow">AUTONOMOUS ENGINEERING WORKSPACE</div>
        <div className="top-actions"><div className="shortcut-pill">⌘/CTRL + K · COMMANDS</div><div className="live-pill"><span className="dot"/>{runtimeState} · {busy?'RUNNING':'READY'}</div></div>
      </div>
      {page==='Command'&&<CommandView {...{prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents:task?.agents||agents.map(a=>({...a,status:'QUEUED'})),metrics:task?[
        ['EXECUTION',task.execution_time_ms?task.execution_time_ms+' ms':'—'],['TOOLS',task.tool_calls||0],['CONFIDENCE',task.confidence?task.confidence+'%':'—'],['RISK',task.risk||'—'],
        ['RELEASE',task.status==='COMPLETED'?'READY':'STANDBY'],['QUALITY',task.quality?task.quality+'%':'—'],['COVERAGE',task.coverage?task.coverage+'%':'—'],['LATENCY',task.latency_ms?task.latency_ms+' ms':'—']
      ]:[['EXECUTION','—'],['TOOLS','—'],['CONFIDENCE','—'],['RISK','—'],['RELEASE','STANDBY'],['QUALITY','—'],['COVERAGE','—'],['LATENCY','—']],seedObjective,setPrompt,notify,approveTask,cancelTask,runtimeState,runtimeMetrics,go}}/>}
      {page==='Agents'&&<AgentsView agents={agents}/>}
      {page==='Memory'&&<MemoryView tasks={tasks} open={openTask}/>}
      {page==='Tools'&&<ToolsView tools={tools}/>}
      {page==='History'&&<HistoryView tasks={tasks} open={openTask}/>}
    </main>
    {selectedTask&&<TaskModal task={selectedTask} close={()=>setSelectedTask(null)}/>}
    {paletteOpen&&<CommandPalette page={page} go={go} close={()=>setPaletteOpen(false)}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}

function CoreVisual({agents,runtimeState}){
  const display=agents.length?agents:[
    {id:1,name:'ORCHESTRATOR',role:'coordination'},{id:2,name:'PLANNER',role:'decomposition'},{id:3,name:'RESEARCHER',role:'evidence'},
    {id:4,name:'CODER',role:'implementation'},{id:5,name:'TESTER',role:'validation'},{id:6,name:'REVIEWER',role:'assurance'},{id:7,name:'RELEASE',role:'delivery'}
  ]
  return <div className="hero-visual">
    <div className="hero-float top"><span>RUNTIME</span><strong>{runtimeState}</strong><em>signal stable</em></div>
    <div className="hero-float bottom"><span>AGENT GRAPH</span><strong>07 nodes</strong><em>coordinated</em></div>
    <div className="core-stage">
      <div className="core-glow"/>
      <div className="core-orbit"/>
      <div className="core-orbit two"/>
      <div className="core-orbit three"/>
      {display.map((a,i)=><div className="agent-pod" key={a.name} style={{'--i':i}}><strong><span className="pod-dot"/>{a.name}</strong><small>{String(a.role||'agent').toUpperCase()}</small></div>)}
      <div className="core-center"><div><div className="core-symbol">C7</div><div className="core-label">CYRUS CORE</div></div></div>
    </div>
  </div>
}

function CommandView({prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents,metrics,seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics,go}){
  return <div className="view">
    <section className="hero-shell">
      <div className="hero-copy">
        <div className="hero-kicker"><span className="line"/>CYRUS / AUTONOMOUS ENGINEERING INTELLIGENCE</div>
        <h1><span>Plan.</span><span>Reason.</span><span className="gradient">Ship software.</span></h1>
        <p>CYRUS turns one engineering objective into an observable agent workflow — coordinating planning, research, implementation, validation, review, and release from a single control surface.</p>
        <div className="hero-actions">
          <button className="primary-cta" onClick={()=>document.querySelector('.command-panel')?.scrollIntoView({behavior:'smooth'})}>Launch command ↗</button>
          <button className="ghost" onClick={()=>{setPrompt(seedObjective);notify('Production API objective loaded')}}>Load example</button>
        </div>
        <div className="hero-meta"><span>07 <b>specialized agents</b></span><span>08 <b>callable tools</b></span><span>01 <b>observable runtime</b></span></div>
      </div>
      <CoreVisual agents={currentAgents} runtimeState={runtimeState}/>
    </section>

    <section className="command-panel">
      <div className="section-title"><strong>DEFINE ENGINEERING OBJECTIVE</strong><span>CTRL + ENTER</span></div>
      <div className="command-grid" style={{marginTop:12}}>
        <div className="objective-wrap"><textarea className="objective" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Build a production-ready REST API for task management with JWT authentication, PostgreSQL persistence, validation, and automated tests..."/><div className="shortcut">CTRL + ENTER</div></div>
        <div className="command-side">
          <div className="modes"><button className={mode==='autonomous'?'active':''} onClick={()=>setMode('autonomous')}>AUTONOMOUS</button><button className={mode==='supervised'?'active':''} onClick={()=>setMode('supervised')}>SUPERVISED</button></div>
          <div className="control-actions">{task?.status==='AWAITING_APPROVAL'&&<button className="approve" onClick={approveTask}>APPROVE RELEASE</button>}{busy&&task?.status==='RUNNING'&&<button className="cancel" onClick={cancelTask}>STOP RUN</button>}<button className="execute" disabled={busy} onClick={execute}>{busy?<><span className="spinner"/>RUNNING GRAPH</>:'EXECUTE OBJECTIVE ↗'}</button></div>
        </div>
      </div>
    </section>

    <div className="metrics">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>

    <div className="capability-strip">
      <div className="capability-card"><div className="capability-icon">01</div><strong>Agentic planning</strong><p>Breaks a large engineering objective into ordered work with explicit ownership.</p></div>
      <div className="capability-card"><div className="capability-icon">02</div><strong>Observable execution</strong><p>Surfaces current state, trace events, tool activity, confidence, and release posture.</p></div>
      <div className="capability-card"><div className="capability-icon">03</div><strong>Human control</strong><p>Supports autonomous runs plus supervised approval checkpoints before release.</p></div>
    </div>

    <section className="content-grid">
      <div className="panel"><div className="panel-head"><strong>AGENT CONSTELLATION</strong><span>07 STAGES / LIVE STATE</span></div><div className="graph">{currentAgents.map(a=><div className={'agent-node '+(a.status==='RUNNING'?'running':'')+' '+(a.status==='COMPLETED'?'done':'')} key={a.name}><div className="agent-top"><span>0{a.id}</span><span>{String(a.type||'agent').toUpperCase()}</span></div><h3>{a.name}</h3><div className="agent-role">{a.role}</div><div className={'status '+a.status}>{a.status}</div></div>)}</div></div>
      <div className="panel"><div className="panel-head"><strong>ARTIFACT EXPLORER</strong><span>GENERATED OUTPUT</span></div>{task?.artifacts?.length?<div className="artifacts">{task.artifacts.map(x=><div className="artifact" key={x.name}><div className="artifact-main"><div className="file-icon">{String(x.language||'FILE').slice(0,2).toUpperCase()}</div><div><strong>{x.name}</strong><small>{x.language} · {x.type}</small></div></div><small>{x.size}</small></div>)}</div>:<div className="empty">No artifacts generated.<br/>Execute an objective to populate the release workspace.</div>}</div>
    </section>

    <section className="panel trace-panel"><div className="panel-head"><strong>EXECUTION TRACE</strong><span>{task?.events?.length||0} EVENTS · {runtimeMetrics?.active_tasks||0}/{runtimeMetrics?.capacity||0} ACTIVE</span></div>{task?.events?.length?<div className="trace">{task.events.map((e,i)=><div className="trace-row" key={e.event_id||i}><span className="time mono">{e.time}</span><span className="agent mono">{e.agent}</span><span className="phase mono">{e.phase}</span><span className="msg">{e.message}</span><span className="dur mono">{e.duration} ms</span></div>)}</div>:<div className="empty">Execution trace is waiting for a command.</div>}</section>
  </div>
}

function AgentsView({agents}){return <div className="view"><PageTitle title="Agent Registry" text="Seven specialized agents connected to one controlled execution graph." meta={agents.length+' ACTIVE DEFINITIONS'}/><div className="cards">{agents.map(a=><div className="agent-card" key={a.id}><div className="num">0{a.id} / {String(a.type||'agent').toUpperCase()}</div><h3>{a.name}</h3><div className="role">{String(a.role||'').toUpperCase()}</div><p>{a.responsibility}</p><div className="status COMPLETED">CAPABILITY · READY</div></div>)}</div></div>}
function ToolsView({tools}){return <div className="view"><PageTitle title="Tool Registry" text="Callable engineering capabilities exposed as runtime surfaces." meta={tools.length+' TOOL ROUTES'}/><div className="tools-grid">{tools.map((t,i)=><div className="tool-card" key={t.name}><div className="tool-icon">0{i+1}</div><h3>{t.name}</h3><p>{t.description}</p><div className="route">{t.route} · {String(t.category||'runtime').toUpperCase()}</div></div>)}</div></div>}
function MemoryView({tasks,open}){return <div className="view"><PageTitle title="Operational Memory" text="Persistent execution summaries and confidence history." meta={tasks.length+' STORED RUNS'}/><div className="memory-grid">{tasks.length?tasks.map(t=><button className="memory" key={t.task_id} onClick={()=>open(t)}><div className="memory-top"><span className="score">{t.score||0}</span><time>{new Date(t.created_at).toLocaleString()}</time></div><h3>{t.objective}</h3><div className="meta">{t.status} · {String(t.mode||'autonomous').toUpperCase()} · {t.confidence||0}% CONFIDENCE</div></button>):<div className="empty">No operational memories yet.</div>}</div></div>}
function HistoryView({tasks,open}){return <div className="view"><PageTitle title="Execution History" text="A compact record of autonomous and supervised runs." meta={tasks.length+' EXECUTIONS'}/><div className="table"><div className="table-row head"><span>OBJECTIVE</span><span>STATUS</span><span>SCORE</span><span>MODE</span><span>TIME</span></div>{tasks.length?tasks.map(t=><button className="table-row" key={t.task_id} onClick={()=>open(t)}><span>{t.objective}</span><span className="green">{t.status}</span><span className="score">{t.score||0}</span><span>{String(t.mode||'autonomous').toUpperCase()}</span><span>{t.execution_time_ms||0} ms</span></button>):<div className="empty">No executions recorded.</div>}</div></div>}
function PageTitle({title,text,meta}){return <div className="page-title"><div><div className="eyebrow">CYRUS / CONTROL SURFACE</div><h2>{title}</h2><p>{text}</p></div><div className="title-side">{meta}</div></div>}
function TaskModal({task,close}){return <div className="modal-back" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>CLOSE</button><div className="eyebrow">{task.task_id}</div><h3>Execution Record</h3><p className="objective-text">{task.objective}</p><div className="metrics">{[['SCORE',task.score||0],['CONFIDENCE',(task.confidence||0)+'%'],['QUALITY',(task.quality||0)+'%'],['COVERAGE',(task.coverage||0)+'%'],['TOOLS',task.tool_calls||0],['LATENCY',(task.latency_ms||0)+' ms'],['RISK',task.risk||'—'],['STATUS',task.status]].map(x=><div className="metric" key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong></div>)}</div><div className="section-title"><strong>ARTIFACTS</strong><span>{task.artifacts?.length||0}</span></div>{task.artifacts?.length?<div className="artifacts">{task.artifacts.map(a=><div className="artifact" key={a.name}><div><strong>{a.name}</strong><small>{a.language} · {a.type}</small></div><small>{a.size}</small></div>)}</div>:<div className="empty">No artifacts in this historical snapshot.</div>}<div className="section-title" style={{marginTop:18}}><strong>EXECUTION TRACE</strong><span>{task.events?.length||0} EVENTS</span></div>{task.events?.length?<div className="trace modal-trace">{task.events.map(e=><div className="trace-row" key={e.event_id||e.time+e.agent}><span className="time mono">{e.time}</span><span className="agent mono">{e.agent}</span><span className="phase mono">{e.phase}</span><span className="msg">{e.message}</span><span className="dur mono">{e.duration} ms</span></div>)}</div>:<div className="empty">No persisted trace.</div>}{task.plan?.length?<><div className="section-title"><strong>PLAN</strong><span>{task.plan.length} STEPS</span></div><div className="detail-list">{task.plan.map((item,i)=><div className="detail-row" key={item}><span>{String(i+1).padStart(2,'0')}</span><strong>{item}</strong></div>)}</div></>:null}</div></div>}
function CommandPalette({page,go,close}){const [query,setQuery]=useState('');const [cursor,setCursor]=useState(0);const items=useMemo(()=>NAV_ITEMS.filter(x=>x.toLowerCase().includes(query.toLowerCase())),[query]);useEffect(()=>setCursor(0),[query]);useEffect(()=>{const onKey=e=>{if(e.key==='ArrowDown'){e.preventDefault();setCursor(i=>items.length?(i+1)%items.length:0)}if(e.key==='ArrowUp'){e.preventDefault();setCursor(i=>items.length?(i-1+items.length)%items.length:0)}if(e.key==='Enter'&&items[cursor]){e.preventDefault();go(items[cursor])}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[items,cursor,go]);return <div className="command-palette-back" onClick={close}><div className="command-palette" onClick={e=>e.stopPropagation()}><div className="palette-head"><span className="eyebrow">FIND</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Jump to a CYRUS surface..." /></div><div className="palette-list">{items.length?items.map((item,i)=><button key={item} className={'palette-item '+(page===item||cursor===i?'active':'')} onMouseEnter={()=>setCursor(i)} onClick={()=>go(item)}><span>{item}</span><small>{cursor===i?'ENTER · OPEN':'OPEN SURFACE 0'+(i+1)}</small></button>):<div className="empty">No CYRUS surfaces match that query.</div>}</div></div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>)

