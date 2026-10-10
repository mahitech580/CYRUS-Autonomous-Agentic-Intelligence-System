const {useEffect,useMemo,useRef,useState}=React

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


const streamTaskEvents=(...args)=>window.CyrusEventStream.streamTaskEvents(...args)


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
      const [health,a,t,h,healthMetrics]=await Promise.all([apiJson('/api/health'),apiJson('/api/agents'),apiJson('/api/tools'),apiJson('/api/tasks'),apiJson('/api/metrics')])
      setRuntimeState(health.runtime==='browser-fallback'?'DEMO':'ONLINE')
      setAgents(a);setTools(t);setTasks(h);setRuntimeMetrics(healthMetrics)
    }catch{
      setRuntimeState('OFFLINE');notify('CYRUS runtime is unreachable')
    }
  }
  const loadTask=async id=>{
    const data=await apiJson('/api/tasks/'+id);setTask(data);return data
  }
  useEffect(()=>{
    const nodes=[...document.querySelectorAll('[data-reveal]')]
    if(!nodes.length)return
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}})
    },{threshold:.12})
    nodes.forEach(node=>observer.observe(node))
    return()=>observer.disconnect()
  },[page])
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
    const controller=new AbortController()
    let active=true
    streamTaskEvents(
      task.task_id,
      controller.signal,
      state=>{
        if(!active)return
        setTask(prev=>prev?{...prev,...state}:prev)
      },
      trace=>{
        if(!active)return
        setTask(prev=>{
          if(!prev)return prev
          const events=[...(prev.events||[]).filter(item=>item.event_id!==trace.event_id),trace]
          return {...prev,events}
        })
      }
    ).catch(error=>{
      if(active&&error?.name!=='AbortError')setRuntimeState(s=>s==='DEMO'?'DEMO':s)
    })
    return()=>{active=false;controller.abort()}
  },[task?.task_id,busy])
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
    <header className="site-nav">
      <button className="nav-brand" onClick={()=>go('Command')} aria-label="Open CYRUS Command">
        <span className="nav-brand-mark"><i/></span>
        <span><strong>CYRUS</strong><small>AGENTIC INTELLIGENCE</small></span>
      </button>
      <nav className="site-nav-links" aria-label="Primary navigation">
        {NAV_ITEMS.map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>go(item)}><span>{String(i+1).padStart(2,'0')}</span>{item}</button>)}
      </nav>
      <div className="nav-status"><span className="dot"/><b>{runtimeState}</b><small>{busy?'RUNNING':'READY'}</small></div>
      <button className="nav-command" onClick={()=>setPaletteOpen(true)}>⌘ K</button>
    </header>

    <main className="main">
      <div className="topbar">
        <div className="eyebrow">AUTONOMOUS ENGINEERING WORKSPACE</div>
        <div className="top-actions"><div className="shortcut-pill">OBSERVABLE RUNTIME</div><div className="live-pill"><span className="dot"/>{runtimeState} · {busy?'RUNNING':'READY'}</div></div>
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

    <div className="mobile-nav" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>go(item)}><span>0{i+1}</span><b>{item}</b></button>)}
    </div>

    {selectedTask&&<TaskModal task={selectedTask} close={()=>setSelectedTask(null)}/>}
    {paletteOpen&&<CommandPalette page={page} go={go} execute={execute} seedObjective={seedObjective} notify={notify} close={()=>setPaletteOpen(false)}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}

function CoreVisual({agents,runtimeState,go}){
  const canvasRef=useRef(null)
  const [hovered,setHovered]=useState(null)
  const fallback=[
    {id:1,name:'ORCHESTRATOR',role:'coordination'},{id:2,name:'PLANNER',role:'decomposition'},{id:3,name:'RESEARCHER',role:'evidence'},
    {id:4,name:'CODER',role:'implementation'},{id:5,name:'TESTER',role:'validation'},{id:6,name:'REVIEWER',role:'assurance'},{id:7,name:'RELEASE',role:'delivery'}
  ]
  const display=agents.length?agents:fallback
  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas)return
    const ctx=canvas.getContext('2d')
    let frame=0
    let raf=0
    let pointer={x:.5,y:.5}
    const resize=()=>{
      const ratio=Math.min(window.devicePixelRatio||1,2)
      const rect=canvas.getBoundingClientRect()
      canvas.width=Math.max(1,Math.floor(rect.width*ratio))
      canvas.height=Math.max(1,Math.floor(rect.height*ratio))
      ctx.setTransform(ratio,0,0,ratio,0,0)
    }
    const move=e=>{
      const rect=canvas.getBoundingClientRect()
      pointer={x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height}
    }
    const starSeed=Array.from({length:115},(_,i)=>({x:(i*73%101)/100,y:(i*47%97)/96,r:1+(i%3)*.35,a:.16+(i%5)*.07}))
    const draw=()=>{
      const rect=canvas.getBoundingClientRect()
      const w=rect.width,h=rect.height
      ctx.clearRect(0,0,w,h)
      const driftX=(pointer.x-.5)*18,driftY=(pointer.y-.5)*12
      frame+=.008
      for(const star of starSeed){
        const twinkle=.55+.45*Math.sin(frame*2+star.x*20)
        ctx.beginPath();ctx.arc(star.x*w+driftX,star.y*h+driftY,star.r,0,Math.PI*2)
        ctx.fillStyle='rgba(191,241,255,'+(star.a*twinkle)+')';ctx.fill()
      }
      const cx=w*.56+driftX*.45,cy=h*.52+driftY*.35
      const positions=display.map((_,i)=>{
        const a=(i/7)*Math.PI*2+frame*.045
        return {x:cx+Math.cos(a)*(w*.31),y:cy+Math.sin(a)*(h*.31)}
      })
      ctx.lineWidth=1
      positions.forEach((p,i)=>{
        const n=positions[(i+1)%positions.length]
        ctx.strokeStyle='rgba(98,232,255,.14)'
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(n.x,n.y);ctx.stroke()
        ctx.strokeStyle='rgba(157,140,255,.08)'
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.stroke()
      })
      const pulse=1+Math.sin(frame*5)*.035
      ctx.beginPath();ctx.arc(cx,cy,86*pulse,0,Math.PI*2)
      ctx.fillStyle='rgba(98,232,255,.04)';ctx.fill()
      ctx.strokeStyle='rgba(98,232,255,.28)';ctx.stroke()
      ctx.beginPath();ctx.arc(cx,cy,112+Math.sin(frame*1.8)*4,0,Math.PI*2)
      ctx.setLineDash([3,9]);ctx.strokeStyle='rgba(157,140,255,.22)';ctx.stroke();ctx.setLineDash([])
      ctx.save()
      const glow=ctx.createRadialGradient(cx,cy,5,cx,cy,150)
      glow.addColorStop(0,'rgba(98,232,255,.22)');glow.addColorStop(.45,'rgba(113,77,255,.12)');glow.addColorStop(1,'rgba(3,5,11,0)')
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,150,0,Math.PI*2);ctx.fill();ctx.restore()
      raf=requestAnimationFrame(draw)
    }
    resize();draw()
    window.addEventListener('resize',resize)
    canvas.addEventListener('pointermove',move,{passive:true})
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);canvas.removeEventListener('pointermove',move)}
  },[display.length])
  return <div className="hero-visual">
    <canvas ref={canvasRef} className="cosmos-canvas" aria-hidden="true"/>
    <div className="hero-float top"><span>RUNTIME</span><strong>{runtimeState}</strong><em>signal stable</em></div>
    <div className="hero-float bottom"><span>AGENT CONSTELLATION</span><strong>07 nodes</strong><em>{hovered||'hover to inspect'}</em></div>
    <div className="core-stage">
      <div className="core-glow"/>
      <div className="core-orbit"/>
      <div className="core-orbit two"/>
      <div className="core-orbit three"/>
      {display.map((a,i)=><button className="agent-pod" key={a.name} onMouseEnter={()=>setHovered(a.name)} onMouseLeave={()=>setHovered(null)} onClick={()=>go('Agents')} title={'Inspect '+a.name} style={{'--i':i,'--angle':(i*51.4)+'deg'}}><strong><span className="pod-dot"/>{a.name}</strong><small>{String(a.role||'agent').toUpperCase()}</small></button>)}
      <button className="core-button" aria-label="Open CYRUS Command" onClick={()=>go('Command')}><div className="core-center"><div><div className="core-symbol">C7</div><div className="core-label">CYRUS CORE</div></div></div></button>
    </div>
  </div>
}

function CommandView({prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents,metrics,seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics,go}){
  const quickObjectives=[
    ['BUILD','Build a production API with authentication, validation, persistence, tests and observability.'],
    ['AUDIT','Audit a service for security, reliability, performance and deployment risks.'],
    ['SHIP','Plan, implement, validate and release a production-ready feature with rollback readiness.'],
  ]
  const signal=(label,value,sub,accent='cyan')=><div className={'nx-signal '+accent}><div><span>{label}</span><small>{sub}</small></div><strong>{value}</strong></div>
  return <div className="nx-view">
    <section className="nx-hero">
      <div className="nx-hero-copy">
        <div className="nx-eyebrow"><i/>CYRUS / AUTONOMOUS ENGINEERING SYSTEM</div>
        <h1>Turn intent into<br/><span>software that moves.</span></h1>
        <p>One command becomes a visible execution graph. CYRUS coordinates planning, research, implementation, validation, review and release with a live operator surface around every run.</p>
        <div className="nx-hero-actions">
          <button className="nx-primary" onClick={()=>document.querySelector('.nx-console')?.scrollIntoView({behavior:'smooth'})}>Launch control <b>↗</b></button>
          <button className="nx-secondary" onClick={()=>{setPrompt(seedObjective);notify('Production objective loaded')}}>Load production objective</button>
        </div>
        <div className="nx-inline-proof">
          <span><b>07</b> agents</span><span><b>08</b> tools</span><span><b>01</b> execution graph</span><span><b>{runtimeState}</b> runtime</span>
        </div>
      </div>
      <div className="nx-hero-visual">
        <div className="nx-visual-top"><span>CORE TELEMETRY</span><b><i/>{busy?'EXECUTING':'STANDBY'}</b></div>
        <CoreVisual agents={currentAgents} runtimeState={runtimeState} go={go}/>
        <div className="nx-visual-card left"><span>ACTIVE WORKLOADS</span><strong>{runtimeMetrics?.active_tasks||0}<small> / {runtimeMetrics?.capacity||4}</small></strong><em>capacity</em></div>
        <div className="nx-visual-card right"><span>LAST SIGNAL</span><strong>{task?.status||'READY'}</strong><em>{task?.current_agent||'ORCHESTRATOR'}</em></div>
      </div>
    </section>

    <section className="nx-console">
      <div className="nx-console-head">
        <div><span className="nx-eyebrow"><i/>01 / COMMAND COMPILER</span><h2>Define the objective.</h2></div>
        <div className="nx-console-state"><span className="nx-live-dot"/>{busy?'GRAPH EXECUTING':'READY FOR INPUT'}<small>CTRL + ENTER</small></div>
      </div>
      <div className="nx-editor">
        <div className="nx-editor-label"><span>OBJECTIVE</span><small>{prompt.length}/4000</small></div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();execute()}}} placeholder="Tell CYRUS what you want shipped…"/>
        <div className="nx-editor-foot">
          <div className="nx-chips">{quickObjectives.map(([label,value])=><button key={label} onClick={()=>setPrompt(value)}>{label}<span>+</span></button>)}</div>
          <span>One objective · one accountable graph</span>
        </div>
      </div>
      <div className="nx-console-controls">
        <div className="nx-mode">
          <span>CONTROL MODE</span>
          <button className={mode==='autonomous'?'active':''} onClick={()=>setMode('autonomous')}><b>01</b> AUTONOMOUS</button>
          <button className={mode==='supervised'?'active':''} onClick={()=>setMode('supervised')}><b>02</b> SUPERVISED</button>
        </div>
        <div className="nx-run-actions">
          {task?.status==='AWAITING_APPROVAL'&&<button className="nx-approve" onClick={approveTask}>APPROVE RELEASE <b>✓</b></button>}
          {busy&&task?.status==='RUNNING'&&<button className="nx-stop" onClick={cancelTask}>STOP RUN <b>■</b></button>}
          <button className="nx-execute" disabled={busy} onClick={execute}>{busy?<><span className="nx-spinner"/>RUNNING EXECUTION GRAPH</>:<>EXECUTE OBJECTIVE <b>↗</b></>}</button>
        </div>
      </div>
    </section>

    <div className="nx-signal-grid">
      {signal('EXECUTION',task?.execution_time_ms?task.execution_time_ms+' ms':'—','end-to-end latency')}
      {signal('CONFIDENCE',task?.confidence?(task.confidence+'%'):'—','operator trust','violet')}
      {signal('QUALITY',task?.quality?(task.quality+'%'):'—','review gate','green')}
      {signal('COVERAGE',task?.coverage?(task.coverage+'%'):'—','validation depth','amber')}
      {signal('TOOL CALLS',task?.tool_calls??runtimeMetrics?.total_tool_calls??0,'runtime actions')}
    </div>

    <section className="nx-workbench">
      <div className="nx-panel nx-agent-panel">
        <div className="nx-panel-head">
          <div><span className="nx-eyebrow"><i/>02 / AGENT GRAPH</span><h3>Seven minds. One trajectory.</h3></div>
          <button onClick={()=>go('Agents')}>Inspect registry <b>↗</b></button>
        </div>
        <div className="nx-agent-track">
          {currentAgents.map((agent,index)=>{
            const status=agent.status||'QUEUED'
            return <button key={agent.name||index} className={'nx-agent '+String(status).toLowerCase()} onClick={()=>go('Agents')}>
              <div className="nx-agent-index">0{index+1}<span>{status==='RUNNING'?'LIVE':'NODE'}</span></div>
              <div className="nx-agent-dot"><i/></div>
              <strong>{agent.name}</strong>
              <small>{String(agent.role||agent.type||'agent').toUpperCase()}</small>
              <em>{status}</em>
              {index<currentAgents.length-1&&<span className="nx-agent-link"/>}
            </button>
          })}
        </div>
        <div className="nx-graph-footer"><span>ORCHESTRATOR</span><i/><span>PLANNING</span><i/><span>BUILD</span><i/><span>VALIDATE</span><i/><span>REVIEW</span><i/><span>RELEASE</span></div>
      </div>

      <div className="nx-side-stack">
        <div className="nx-panel nx-health">
          <div className="nx-panel-head compact"><span className="nx-eyebrow"><i/>03 / RUNTIME HEALTH</span><strong className="nx-health-status"><i/>{runtimeState}</strong></div>
          <div className="nx-health-main"><div className="nx-ring"><span>{Math.round((runtimeMetrics?.capacity_utilization||0)*100)}<small>%</small></span></div><div><strong>{runtimeMetrics?.active_tasks||0} active</strong><small>{runtimeMetrics?.queued_tasks||0} queued · {runtimeMetrics?.awaiting_approval||0} approvals</small><em>capacity utilization</em></div></div>
          <div className="nx-health-bars"><div><span/><b/><i/></div><div><span/><b/><i/></div><div><span/><b/><i/></div></div>
        </div>

        <div className="nx-panel nx-memory">
          <div className="nx-panel-head compact"><span className="nx-eyebrow"><i/>04 / OPERATIONAL MEMORY</span><button onClick={()=>go('History')}>OPEN ↗</button></div>
          {task?<><div className="nx-memory-objective">{task.objective}</div><div className="nx-memory-row"><span>STATUS</span><b>{task.status}</b></div><div className="nx-memory-row"><span>RISK</span><b>{task.risk||'LOW'}</b></div></>:<div className="nx-empty-mini">Run an objective to create a persistent execution memory.</div>}
        </div>
      </div>
    </section>

    <section className="nx-observability">
      <div className="nx-panel nx-trace-panel">
        <div className="nx-panel-head">
          <div><span className="nx-eyebrow"><i/>05 / LIVE TRACE</span><h3>Watch the system think in public.</h3></div>
          <span className="nx-trace-count">{task?.events?.length||0} EVENTS</span>
        </div>
        {task?.events?.length?<div className="nx-trace-list">{task.events.slice(-8).map((event,index)=><div className="nx-trace-row" key={event.event_id||index}><span>{event.time}</span><b>{event.agent}</b><strong>{event.phase}</strong><p>{event.message}</p><em>{event.duration} ms</em></div>)}</div>:<div className="nx-empty-state"><div>◎</div><strong>No execution signal yet.</strong><span>The trace will populate as soon as the agent graph starts moving.</span></div>}
      </div>
      <div className="nx-panel nx-artifacts">
        <div className="nx-panel-head compact"><span className="nx-eyebrow"><i/>06 / RELEASE PACKAGE</span><span>{task?.artifacts?.length||0} FILES</span></div>
        {task?.artifacts?.length?<div className="nx-artifact-list">{task.artifacts.map((item,index)=><div className="nx-artifact-row" key={item.name}><div className="nx-file-icon">{String(item.language||'FILE').slice(0,2).toUpperCase()}</div><div><strong>{item.name}</strong><small>{item.language} · {item.type}</small></div><span>{item.size}</span></div>)}</div>:<div className="nx-empty-state small"><div>⌁</div><strong>Artifacts waiting.</strong><span>Release outputs appear here after the delivery stage.</span></div>}
      </div>
    </section>

    <section className="nx-capabilities">
      <div className="nx-cap-head"><span className="nx-eyebrow"><i/>07 / WHY CYRUS</span><h2>Designed like a control system.<br/><span>Not another chat window.</span></h2></div>
      <div className="nx-cap-grid">
        <article><span>01</span><div><b>Visible orchestration</b><p>Every agent has a role, state and measurable output. The graph is the product, not hidden plumbing.</p></div></article>
        <article><span>02</span><div><b>Operator control</b><p>Autonomous execution and supervised release checkpoints coexist in the same interaction model.</p></div></article>
        <article><span>03</span><div><b>Release intelligence</b><p>Confidence, quality, coverage, risk and trace evidence stay attached to every execution record.</p></div></article>
      </div>
    </section>

    <section className="nx-bottom-cta">
      <div><span className="nx-eyebrow"><i/>08 / NEXT OBJECTIVE</span><h2>Give CYRUS something difficult.</h2><p>The interface is ready. The graph is waiting.</p></div>
      <button onClick={()=>document.querySelector('.nx-console')?.scrollIntoView({behavior:'smooth'})}>Open command surface <b>↗</b></button>
    </section>
  </div>
}

function AgentsView({agents}){return <div className="view"><PageTitle title="Agent Registry" text="Seven specialized agents connected to one controlled execution graph." meta={agents.length+' ACTIVE DEFINITIONS'}/><div className="cards">{agents.map(a=><div className="agent-card" key={a.id}><div className="num">0{a.id} / {String(a.type||'agent').toUpperCase()}</div><h3>{a.name}</h3><div className="role">{String(a.role||'').toUpperCase()}</div><p>{a.responsibility}</p><div className="status COMPLETED">CAPABILITY · READY</div></div>)}</div></div>}
function ToolsView({tools}){return <div className="view"><PageTitle title="Tool Registry" text="Callable engineering capabilities exposed as runtime surfaces." meta={tools.length+' TOOL ROUTES'}/><div className="tools-grid">{tools.map((t,i)=><div className="tool-card" key={t.name}><div className="tool-icon">0{i+1}</div><h3>{t.name}</h3><p>{t.description}</p><div className="route">{t.route} · {String(t.category||'runtime').toUpperCase()}</div></div>)}</div></div>}
function MemoryView({tasks,open}){return <div className="view"><PageTitle title="Operational Memory" text="Persistent execution summaries and confidence history." meta={tasks.length+' STORED RUNS'}/><div className="memory-grid">{tasks.length?tasks.map(t=><button className="memory" key={t.task_id} onClick={()=>open(t)}><div className="memory-top"><span className="score">{t.score||0}</span><time>{new Date(t.created_at).toLocaleString()}</time></div><h3>{t.objective}</h3><div className="meta">{t.status} · {String(t.mode||'autonomous').toUpperCase()} · {t.confidence||0}% CONFIDENCE</div></button>):<div className="empty">No operational memories yet.</div>}</div></div>}
function HistoryView({tasks,open}){
  const [query,setQuery]=useState('')
  const [status,setStatus]=useState('ALL')
  const [sort,setSort]=useState('newest')
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return tasks.filter(item=>{
      const matchesStatus=status==='ALL'||String(item.status||'UNKNOWN').toUpperCase()===status
      const searchable=[item.task_id,item.objective,item.status,item.mode,item.current_agent].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus&&(!needle||searchable.includes(needle))
    }).sort((left,right)=>{
      if(sort==='oldest')return String(left.created_at||'').localeCompare(String(right.created_at||''))
      if(sort==='score-high')return Number(right.score||0)-Number(left.score||0)
      if(sort==='score-low')return Number(left.score||0)-Number(right.score||0)
      if(sort==='duration')return Number(right.execution_time_ms||0)-Number(left.execution_time_ms||0)
      return String(right.created_at||'').localeCompare(String(left.created_at||''))
    })
  },[tasks,query,status,sort])
  const count=key=>tasks.filter(item=>String(item.status||'UNKNOWN').toUpperCase()===key).length
  const exportCsv=()=>{
    if(!filtered.length)return
    const columns=[
      ['task_id','Task ID'],['created_at','Created at'],['objective','Objective'],['status','Status'],
      ['mode','Mode'],['score','Score'],['quality','Quality'],['confidence','Confidence'],
      ['coverage','Coverage'],['execution_time_ms','Execution time (ms)'],['tool_calls','Tool calls'],
      ['tests_passed','Tests passed'],['tests_failed','Tests failed']
    ]
    const cell=value=>{
      let text=String(value??'')
      if('=+-@'.includes(text.trimStart().charAt(0)))text="'"+text
      return '"'+text.replace(/"/g,'""')+'"'
    }
    const csv=[columns.map(([,label])=>cell(label)).join(','),...filtered.map(item=>columns.map(([key])=>cell(item[key])).join(','))].join(String.fromCharCode(13,10))
    const url=URL.createObjectURL(new Blob([String.fromCharCode(0xfeff),csv],{type:'text/csv;charset=utf-8'}))
    const link=document.createElement('a')
    link.href=url
    link.download='cyrus-execution-history-'+new Date().toISOString().slice(0,10)+'.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const clearFilters=()=>{setQuery('');setStatus('ALL');setSort('newest')}
  const activeFilters=Boolean(query.trim())||status!=='ALL'||sort!=='newest'
  return <div className="view history-view">
    <PageTitle title="Execution History" text="Search, investigate and export execution evidence from the CYRUS runtime." meta={tasks.length+' TOTAL RUNS'}/>
    <div className="history-overview" aria-label="Execution status overview">
      <div className="history-stat"><span>ALL EXECUTIONS</span><strong>{tasks.length}</strong><small>Available records</small></div>
      <div className="history-stat running"><span>IN PROGRESS</span><strong>{count('RUNNING')+count('AWAITING_APPROVAL')}</strong><small>{count('AWAITING_APPROVAL')} awaiting approval</small></div>
      <div className="history-stat completed"><span>COMPLETED</span><strong>{count('COMPLETED')}</strong><small>Release-ready runs</small></div>
      <div className="history-stat failed"><span>FAILED / CANCELLED</span><strong>{count('FAILED')+count('CANCELLED')}</strong><small>Requires attention</small></div>
    </div>
    <section className="history-console" aria-label="Execution history filters">
      <div className="history-console-head"><div><span className="eyebrow">RECORD EXPLORER</span><h3>Find an execution.</h3></div><span className="history-result-count">{filtered.length} / {tasks.length} RECORDS</span></div>
      <div className="history-filters">
        <label className="history-search"><span aria-hidden="true">⌕</span><input aria-label="Search execution history" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search objective, task ID, agent or mode…"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}>×</button>}</label>
        <label className="history-select"><span>STATUS</span><select aria-label="Filter executions by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option><option value="RUNNING">Running</option><option value="AWAITING_APPROVAL">Awaiting approval</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label className="history-select"><span>SORT BY</span><select aria-label="Sort execution history" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score-high">Highest score</option><option value="score-low">Lowest score</option><option value="duration">Longest execution</option></select></label>
        <button className="history-export" type="button" onClick={exportCsv} disabled={!filtered.length} title="Export the filtered result set as CSV"><span aria-hidden="true">↧</span> EXPORT CSV</button>
        {activeFilters&&<button className="history-reset" type="button" onClick={clearFilters}>Reset filters</button>}
      </div>
      <div className="history-table-wrap">
        <div className="table history-table"><div className="table-row head"><span>OBJECTIVE / ID</span><span>STATUS</span><span>SCORE</span><span>MODE</span><span>DURATION</span><span>OPEN</span></div>
          {filtered.length?filtered.map(item=><button className="table-row history-row" key={item.task_id} onClick={()=>open(item)} aria-label={'Open execution '+item.task_id}>
            <span className="history-objective"><strong>{item.objective||'Untitled execution'}</strong><small>{item.task_id} · {item.created_at?new Date(item.created_at).toLocaleString():'Date unavailable'}</small></span>
            <span><i className={'history-status '+String(item.status||'UNKNOWN').toLowerCase().replace(/[^a-z_]/g,'-')}/>{String(item.status||'UNKNOWN').replaceAll('_',' ')}</span>
            <span className="score">{Number(item.score||0).toFixed(1)}</span>
            <span className="history-mode">{String(item.mode||'autonomous').toUpperCase()}</span>
            <span className="history-duration">{Number(item.execution_time_ms||0).toLocaleString()} ms</span>
            <span className="history-open-icon">↗</span>
          </button>):<div className="history-empty"><span>⌕</span><strong>No matching executions</strong><p>{tasks.length?'Adjust your search or status filters to see more records.':'Run an objective from Command to populate execution history.'}</p>{activeFilters&&<button type="button" onClick={clearFilters}>Clear all filters</button>}</div>}
        </div>
      </div>
      <footer className="history-foot"><span>ORDERED BY {sort.replace('-',' ').toUpperCase()}</span><span>EXPORT INCLUDES FILTERED RESULTS ONLY</span></footer>
    </section>
  </div>
}
function PageTitle({title,text,meta}){return <div className="page-title"><div><div className="eyebrow">CYRUS / CONTROL SURFACE</div><h2>{title}</h2><p>{text}</p></div><div className="title-side">{meta}</div></div>}
function TaskModal({task,close}){return <div className="modal-back" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>CLOSE</button><div className="eyebrow">{task.task_id}</div><h3>Execution Record</h3><p className="objective-text">{task.objective}</p><div className="metrics">{[['SCORE',task.score||0],['CONFIDENCE',(task.confidence||0)+'%'],['QUALITY',(task.quality||0)+'%'],['COVERAGE',(task.coverage||0)+'%'],['TOOLS',task.tool_calls||0],['LATENCY',(task.latency_ms||0)+' ms'],['RISK',task.risk||'—'],['STATUS',task.status]].map(x=><div className="metric" key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong></div>)}</div><div className="section-title"><strong>ARTIFACTS</strong><span>{task.artifacts?.length||0}</span></div>{task.artifacts?.length?<div className="artifacts">{task.artifacts.map(a=><div className="artifact" key={a.name}><div><strong>{a.name}</strong><small>{a.language} · {a.type}</small></div><small>{a.size}</small></div>)}</div>:<div className="empty">No artifacts in this historical snapshot.</div>}<div className="section-title" style={{marginTop:18}}><strong>EXECUTION TRACE</strong><span>{task.events?.length||0} EVENTS</span></div>{task.events?.length?<div className="trace modal-trace">{task.events.map(e=><div className="trace-row" key={e.event_id||e.time+e.agent}><span className="time mono">{e.time}</span><span className="agent mono">{e.agent}</span><span className="phase mono">{e.phase}</span><span className="msg">{e.message}</span><span className="dur mono">{e.duration} ms</span></div>)}</div>:<div className="empty">No persisted trace.</div>}{task.plan?.length?<><div className="section-title"><strong>PLAN</strong><span>{task.plan.length} STEPS</span></div><div className="detail-list">{task.plan.map((item,i)=><div className="detail-row" key={item}><span>{String(i+1).padStart(2,'0')}</span><strong>{item}</strong></div>)}</div></>:null}</div></div>}
function CommandPalette({page,go,execute,seedObjective,notify,close}){const [query,setQuery]=useState('');const [cursor,setCursor]=useState(0);const actions=[...NAV_ITEMS.map(item=>({label:item,type:'surface',run:()=>go(item)})),{label:'Run example objective',type:'action',run:()=>{setQuery('');close();notify('Launching the example objective');setTimeout(()=>execute(),80)}}];const items=useMemo(()=>actions.filter(x=>x.label.toLowerCase().includes(query.toLowerCase())),[query]);useEffect(()=>setCursor(0),[query]);useEffect(()=>{const onKey=e=>{if(e.key==='ArrowDown'){e.preventDefault();setCursor(i=>items.length?(i+1)%items.length:0)}if(e.key==='ArrowUp'){e.preventDefault();setCursor(i=>items.length?(i-1+items.length)%items.length:0)}if(e.key==='Enter'&&items[cursor]){e.preventDefault();items[cursor].run()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[items,cursor]);return <div className="command-palette-back" onClick={close}><div className="command-palette" onClick={e=>e.stopPropagation()}><div className="palette-head"><span className="eyebrow">COMMAND</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Jump to a CYRUS surface or run an action..." /></div><div className="palette-list">{items.length?items.map((item,i)=><button key={item.label} className={'palette-item '+(cursor===i?'active':'')} onMouseEnter={()=>setCursor(i)} onClick={item.run}><span>{item.label}</span><small>{cursor===i?(item.type==='action'?'ENTER · RUN':'ENTER · OPEN'):(item.type==='action'?'EXECUTE':'SURFACE')}</small></button>):<div className="empty">No CYRUS command matches that query.</div>}</div></div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>)

