const {useEffect,useMemo,useState}=React

const API_TIMEOUT_MS = 6500

async function apiJson(path, options={}){
  const method=(options.method||'GET').toUpperCase()
  const attempts=method==='GET'?2:1
  let lastError
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),API_TIMEOUT_MS)
    try{
      const res=await fetch(path,{...options,signal:controller.signal})
      const data=await res.json().catch(()=>({}))
      if(!res.ok) throw new Error(data.error||'CYRUS request failed')
      return data
    }catch(error){
      lastError=error
      if(attempt<attempts-1) await new Promise(resolve=>setTimeout(resolve,180))
    }finally{
      clearTimeout(timer)
    }
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

  const notify=(message)=>{setToast(message);setTimeout(()=>setToast(''),2400)}
  const loadBase=async()=>{
    try{
      const [health,a,t,h]=await Promise.all([
        apiJson('/api/health'),
        apiJson('/api/agents'),
        apiJson('/api/tools'),
        apiJson('/api/tasks'),
        apiJson('/api/metrics')
      ])
      setRuntimeState(health.runtime==='browser-fallback'?'DEMO':'ONLINE')
      setAgents(a);setTools(t);setTasks(h);setRuntimeMetrics(healthMetrics)
    }catch(error){
      setRuntimeState('OFFLINE')
      notify('CYRUS runtime is unreachable')
    }
  }
  const loadTask=async id=>{
    const data=await apiJson('/api/tasks/'+id)
    setTask(data)
    return data
  }
  useEffect(()=>{loadBase()},[])
  useEffect(()=>{
    if(!task?.task_id)return
    const timer=setInterval(async()=>{
      const data=await loadTask(task.task_id)
      if(['COMPLETED','FAILED','CANCELLED'].includes(data.status)){setBusy(false);clearInterval(timer);loadBase()}
      if(data.status==='AWAITING_APPROVAL'){setBusy(false);clearInterval(timer);loadBase()}
    },650)
    return()=>clearInterval(timer)
  },[task?.task_id])
  const execute=async()=>{
    const objective=(prompt||seedObjective).trim()
    if(!objective)return notify('Enter an engineering objective first')
    setBusy(true);setPrompt(objective)
    let data
    try{
      const idempotencyKey=(globalThis.crypto?.randomUUID?.()||('ui-'+Date.now()+'-'+Math.random().toString(36).slice(2))).slice(0,100)
      data=await apiJson('/api/execute',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({prompt:objective,mode})})
    }catch(error){
      setBusy(false)
      return notify(error.message||'Execution failed')
    }
    await loadTask(data.task_id);notify('Objective accepted by CYRUS runtime')
  }
  const approveTask=async()=>{
    if(!task?.task_id)return
    try{
      await apiJson('/api/tasks/'+task.task_id+'/approve',{method:'POST'})
      notify('Release approval granted')
      setBusy(true)
      await loadTask(task.task_id)
    }catch(error){notify(error.message||'Approval failed')}
  }
  const cancelTask=async()=>{
    if(!task?.task_id)return
    try{
      await apiJson('/api/tasks/'+task.task_id+'/cancel',{method:'POST'})
      notify('Cancellation requested')
      await loadTask(task.task_id)
    }catch(error){notify(error.message||'Cancellation failed')}
  }
  const openTask=async id=>{
    try{setSelectedTask(await loadTask(id))}catch(error){notify(error.message||'Unable to open execution')}
  }

  useEffect(()=>{
    const onKey=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();execute()}}
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
  })

  const currentAgents=task?.agents||agents.map(a=>({...a,status:'QUEUED'}))
  const metrics=task?[
    ['EXECUTION',task.execution_time_ms?`${task.execution_time_ms} ms`:'—'],['TOOLS',task.tool_calls||0],['CONFIDENCE',task.confidence?`${task.confidence}%`:'—'],['RISK',task.risk||'—'],['RELEASE',task.status==='COMPLETED'?'READY':'STANDBY'],['QUALITY',task.quality?`${task.quality}%`:'—'],['COVERAGE',task.coverage?`${task.coverage}%`:'—'],['LATENCY',task.latency_ms?`${task.latency_ms} ms`:'—']
  ]:[['EXECUTION','—'],['TOOLS','—'],['CONFIDENCE','—'],['RISK','—'],['RELEASE','STANDBY'],['QUALITY','—'],['COVERAGE','—'],['LATENCY','—']]

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span/></div><div><strong>CYRUS</strong><small>AGENTIC INTELLIGENCE</small></div></div>
      <nav className="nav">{['Command','Agents','Memory','Tools','History'].map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>setPage(item)}><span className="num">0{i+1}</span><span className="label">{item}</span></button>)}</nav>
      <div className="side-foot">CYRUS CORE 1.0<br/>FASTAPI SIGNAL BRIDGE<br/>LOCAL EXECUTION NODE</div>
    </aside>
    <main className="main">
      <div className="topbar"><div className="eyebrow">AUTONOMOUS ENGINEERING WORKSPACE</div><div className="live-pill"><span className="dot"/> {runtimeState} · {busy?'RUNNING':'READY'}</div></div>
      {page==='Command'&&<CommandView {...{prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents,metrics,seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics}}/>}
      {page==='Agents'&&<AgentsView agents={agents}/>} 
      {page==='Memory'&&<MemoryView tasks={tasks} open={openTask}/>} 
      {page==='Tools'&&<ToolsView tools={tools}/>} 
      {page==='History'&&<HistoryView tasks={tasks} open={openTask}/>} 
    </main>
    {selectedTask&&<TaskModal task={selectedTask} close={()=>setSelectedTask(null)}/>} 
    {toast&&<div className="toast">{toast}</div>}
  </div>
}

function CommandView({prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents,metrics,seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics}){
  return <div className="view">
    <section className="hero"><div className="hero-panel"><div className="eyebrow">EXECUTION / 01</div><h1>Command Center</h1><p>Turn an engineering objective into a coordinated seven-stage execution. CYRUS plans, researches, builds, validates, reviews and releases through one observable runtime.</p><div className="hero-actions"><button className="ghost" onClick={()=>{setPrompt(seedObjective);notify('Production API objective loaded')}}>LOAD EXAMPLE</button><button className="ghost" onClick={()=>setPrompt('')}>CLEAR</button></div></div><div className="signal-card hero-panel"><div><div className="signal-label">RELEASE SIGNAL</div><div className="signal">{task?.status==='COMPLETED'?'READY':'STANDBY'}</div></div><div className="signal-meta">{task?task.summary:'No execution has been submitted.'}</div></div></section>
    <section className="panel command"><div className="section-title"><strong>DEFINE ENGINEERING OBJECTIVE</strong><span>CTRL + ENTER</span></div><div className="objective-wrap"><textarea className="objective" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Build a production-ready REST API for task management with JWT authentication, PostgreSQL persistence, validation, and automated tests..."/><div className="shortcut">CTRL + ENTER</div></div><div className="command-bar"><div className="modes"><button className={mode==='autonomous'?'active':''} onClick={()=>setMode('autonomous')}>AUTONOMOUS</button><button className={mode==='supervised'?'active':''} onClick={()=>setMode('supervised')}>SUPERVISED</button></div><div className="control-actions">{task?.status==='AWAITING_APPROVAL'&&<button className="approve" onClick={approveTask}>APPROVE RELEASE</button>}{busy&&task?.status==='RUNNING'&&<button className="cancel" onClick={cancelTask}>STOP RUN</button>}<button className="execute" disabled={busy} onClick={execute}>{busy?<><span className="spinner"/>RUNNING GRAPH</>:`EXECUTE OBJECTIVE ↗`}</button></div></div></section>
    <div className="metrics">{metrics.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="content-grid"><div className="panel"><div className="panel-head"><strong>LIVE AGENT GRAPH</strong><span>7 STAGES / SERIAL TRANSITION</span></div><div className="graph">{currentAgents.map(a=><div className={'agent-node '+(a.status==='RUNNING'?'running':'')+' '+(a.status==='COMPLETED'?'done':'')} key={a.name}><div className="agent-top"><span>0{a.id}</span><span>{a.type?.toUpperCase()}</span></div><h3>{a.name}</h3><div className="agent-role">{a.role}</div><div className={'status '+a.status}>{a.status}</div></div>)}</div></div><div className="panel"><div className="panel-head"><strong>ARTIFACT EXPLORER</strong><span>GENERATED OUTPUT</span></div>{task?.artifacts?.length?<div className="artifacts">{task.artifacts.map(x=><div className="artifact" key={x.name}><div className="artifact-main"><div className="file-icon">{x.language.slice(0,2).toUpperCase()}</div><div><strong>{x.name}</strong><small>{x.language} · {x.type}</small></div></div><small>{x.size}</small></div>)}</div>:<div className="empty">No artifacts generated.</div>}</div></section>
    <section className="panel"><div className="panel-head"><strong>EXECUTION TRACE</strong><span>{task?.events?.length||0} EVENTS · {runtimeMetrics?.active_tasks||0}/{runtimeMetrics?.capacity||0} ACTIVE</span></div>{task?.events?.length?<div className="trace">{task.events.map((e,i)=><div className="trace-row" key={i}><span className="time mono">{e.time}</span><span className="agent mono">{e.agent}</span><span className="phase mono">{e.phase}</span><span className="msg">{e.message}</span><span className="dur mono">{e.duration} ms</span></div>)}</div>:<div className="empty">Execution trace is waiting for a command.</div>}</section>
  </div>
}

function AgentsView({agents}){return <div className="view"><PageTitle title="Agent Registry" text="Seven specialized agents, one controlled execution graph."/><div className="cards">{agents.map(a=><div className="agent-card" key={a.id}><div className="num">0{a.id} / {a.type.toUpperCase()}</div><h3>{a.name}</h3><div className="role">{a.role.toUpperCase()}</div><p>{a.responsibility}</p><div className="status COMPLETED">CAPABILITY · READY</div></div>)}</div></div>}
function ToolsView({tools}){return <div className="view"><PageTitle title="Tool Registry" text="Engineering capabilities exposed as callable runtime surfaces."/><div className="tools-grid">{tools.map((t,i)=><div className="tool-card" key={t.name}><div className="tool-icon">0{i+1}</div><h3>{t.name}</h3><p>{t.description}</p><div className="route">{t.route} · {t.category.toUpperCase()}</div></div>)}</div></div>}
function MemoryView({tasks,open}){return <div className="view"><PageTitle title="Operational Memory" text="Persistent execution summaries and confidence history."/><div className="memory-grid">{tasks.length?tasks.map(t=><button className="memory" key={t.task_id} onClick={()=>open(t)}><div className="memory-top"><span className="score">{t.score||0}</span><time>{new Date(t.created_at).toLocaleString()}</time></div><h3>{t.objective}</h3><div className="meta">{t.status} · {t.mode?.toUpperCase()} · {t.confidence||0}% CONFIDENCE</div></button>):<div className="empty">No operational memories yet.</div>}</div></div>}
function HistoryView({tasks,open}){return <div className="view"><PageTitle title="Execution History" text="A compact record of previous autonomous runs."/><div className="table"><div className="table-row head"><span>OBJECTIVE</span><span>STATUS</span><span>SCORE</span><span>MODE</span><span>TIME</span></div>{tasks.length?tasks.map(t=><button className="table-row" key={t.task_id} onClick={()=>open(t)}><span>{t.objective}</span><span className="green">{t.status}</span><span className="score">{t.score||0}</span><span>{t.mode?.toUpperCase()}</span><span>{t.execution_time_ms||0} ms</span></button>):<div className="empty">No executions recorded.</div>}</div></div>}
function PageTitle({title,text}){return <div className="page-title"><div><div className="eyebrow">CYRUS / CONTROL SURFACE</div><h2>{title}</h2><p>{text}</p></div></div>}
function TaskModal({task,close}){return <div className="modal-back" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>CLOSE</button><div className="eyebrow">{task.task_id}</div><h3>Execution Record</h3><p className="objective-text">{task.objective}</p><div className="metrics" style={{marginTop:16}}>{[['SCORE',task.score||0],['CONFIDENCE',`${task.confidence||0}%`],['QUALITY',`${task.quality||0}%`],['COVERAGE',`${task.coverage||0}%`],['TOOLS',task.tool_calls||0],['LATENCY',`${task.latency_ms||0} ms`],['RISK',task.risk||'—'],['STATUS',task.status]].map(x=><div className="metric" key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong></div>)}</div><div className="section-title"><strong>ARTIFACTS</strong><span>{task.artifacts?.length||0}</span></div>{task.artifacts?.length?<div className="artifacts">{task.artifacts.map(a=><div className="artifact" key={a.name}><div><strong>{a.name}</strong><small>{a.language} · {a.type}</small></div><small>{a.size}</small></div>)}</div>:<div className="empty">No artifacts in this historical snapshot.</div>}</div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
