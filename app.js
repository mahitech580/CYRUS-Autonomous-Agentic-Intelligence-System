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


async function streamTaskEvents(taskId,signal,onState,onTrace){
  const res=await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/stream',{
    headers:{Accept:'text/event-stream'},
    signal
  })
  if(!res.ok||!res.body)throw new Error('Live event stream unavailable')
  const reader=res.body.getReader()
  const decoder=new TextDecoder()
  let buffer=''
  let eventName='message'
  let eventId=''
  let data=[]
  const flush=()=>{
    if(!data.length)return
    const raw=data.join('\n')
    let payload=null
    try{payload=JSON.parse(raw)}catch{return}
    if(eventName==='state')onState(payload)
    if(eventName==='trace')onTrace(payload)
    eventName='message';eventId='';data=[]
  }
  try{
    while(true){
      const {value,done}=await reader.read()
      if(done)break
      buffer+=decoder.decode(value,{stream:true})
      const lines=buffer.split(/\r?\n/)
      buffer=lines.pop()||''
      for(const line of lines){
        if(!line){flush();continue}
        if(line.startsWith(':'))continue
        if(line.startsWith('event:'))eventName=line.slice(6).trim()
        else if(line.startsWith('id:'))eventId=line.slice(3).trim()
        else if(line.startsWith('data:'))data.push(line.slice(5).trimStart())
      }
    }
    if(buffer) data.push(buffer)
    flush()
  }finally{reader.releaseLock()}
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
      <CoreVisual agents={currentAgents} runtimeState={runtimeState} go={go}/>
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

    <section className="story-band reveal" data-reveal>
      <div className="story-label">01 / THE IDEA</div>
      <div className="story-copy"><div className="story-eyebrow">NOT ANOTHER CHAT BOX</div><h2>One objective.<br/><span>Seven specialized minds.</span></h2><p>CYRUS is designed as an execution system: a visible chain of reasoning and delivery where every stage has a job, a state, and a measurable output.</p></div>
      <div className="story-stats"><div><strong>07</strong><span>AGENTS</span></div><div><strong>08</strong><span>TOOLS</span></div><div><strong>01</strong><span>GRAPH</span></div></div>
    </section>

    <section className="proof-rail reveal" data-reveal>
      <div className="proof-item"><span>EXECUTION GRAPH</span><strong>07</strong><small>specialized agents</small></div>
      <div className="proof-item"><span>TOOL SURFACE</span><strong>08</strong><small>callable capabilities</small></div>
      <div className="proof-item"><span>CONTROL MODES</span><strong>02</strong><small>autonomous + supervised</small></div>
      <div className="proof-item"><span>RUNTIME SIGNAL</span><strong>LIVE</strong><small>health + metrics</small></div>
    </section>

    <section className="case-studies reveal" data-reveal>
      <div className="section-intro"><div><div className="eyebrow">02 / WHAT CYRUS SHIPS</div><h2>Systems, not screens.</h2></div><span>PRODUCT CAPABILITIES</span></div>
      <div className="case-grid">
        <article className="case-card case-feature">
          <div className="case-art"><div className="mini-orbit one"></div><div className="mini-orbit two"></div><div className="mini-core">01</div></div>
          <div className="case-copy"><span>ORCHESTRATION</span><h3>Seven stages. One execution graph.</h3><p>Planning, research, coding, testing, review and release are surfaced as an observable sequence instead of hidden behind one assistant response.</p><div className="case-tags"><b>PLAN</b><b>RESEARCH</b><b>BUILD</b><b>REVIEW</b></div></div>
        </article>
        <article className="case-card">
          <div className="case-number">02</div><span>BROWSER RUNTIME</span><h3>Demo-first resilience.</h3><p>The browser fallback keeps the product explorable on GitHub Pages while local persistence, idempotency and execution history preserve the interaction model.</p><div className="case-metric"><strong>LOCAL</strong><small>DEMO MODE</small></div>
        </article>
        <article className="case-card">
          <div className="case-number">03</div><span>RUNTIME SAFETY</span><h3>Control before release.</h3><p>Bounded workers, request correlation, rate-limit hints, readiness checks and supervised approval make the runtime explicit about operational state.</p><div className="case-metric"><strong>02</strong><small>CONTROL MODES</small></div>
        </article>
      </div>
    </section>

    <section className="workflow-section reveal" data-reveal>
      <div className="section-intro"><div><div className="eyebrow">02 / EXECUTION GRAPH</div><h2>From intent to release.</h2></div><span>OBSERVABLE / SERIAL / CONTROLLED</span></div>
      <div className="workflow-line"><div className="workflow-step" key="Define"><span>01</span><strong>Define</strong><small>objective</small></div><div className="workflow-step" key="Plan"><span>02</span><strong>Plan</strong><small>decomposition</small></div><div className="workflow-step" key="Research"><span>03</span><strong>Research</strong><small>evidence</small></div><div className="workflow-step" key="Build"><span>04</span><strong>Build</strong><small>implementation</small></div><div className="workflow-step" key="Validate"><span>05</span><strong>Validate</strong><small>quality</small></div><div className="workflow-step" key="Review"><span>06</span><strong>Review</strong><small>assurance</small></div><div className="workflow-step" key="Release"><span>07</span><strong>Release</strong><small>delivery</small></div></div>
    </section>

    <section className="signature-grid reveal" data-reveal>
      <div className="signature-main"><div className="eyebrow">03 / SYSTEM PHILOSOPHY</div><h2>Make the invisible work visible.</h2><p>Every run surfaces confidence, quality, coverage, latency, artifacts, approvals and trace events so the operator can understand what happened—not just receive a final answer.</p><button className="ghost" onClick={()=>go('History')}>Explore execution history ↗</button></div>
      <div className="signature-stack">
        <div className="signal-card-mini"><span>STATE</span><strong>{busy?'RUNNING':'READY'}</strong><em>{runtimeState}</em></div>
        <div className="signal-card-mini"><span>CAPACITY</span><strong>{runtimeMetrics?.active_tasks||0} / {runtimeMetrics?.capacity||4}</strong><em>active workloads</em></div>
        <div className="signal-card-mini"><span>QUALITY</span><strong>{task?.quality?task.quality+'%':'—'}</strong><em>latest completed run</em></div>
      </div>
    </section>

    <section className="surface-gallery reveal" data-reveal>
      <div className="section-intro"><div><div className="eyebrow">05 / EXPLORE CYRUS</div><h2>Enter the system.</h2></div><span>INTERACTIVE SURFACES</span></div>
      <div className="surface-grid">
        <button className="surface-card" onClick={()=>go('Command')} key="Command"><span className="surface-num">01</span><div><small>command</small><h3>Command</h3><p>Launch objectives and watch the seven-agent graph execute.</p></div><b>↗</b></button><button className="surface-card" onClick={()=>go('Agents')} key="Agents"><span className="surface-num">02</span><div><small>agent registry</small><h3>Agents</h3><p>Inspect the roles, responsibilities, and runtime capabilities.</p></div><b>↗</b></button><button className="surface-card" onClick={()=>go('Tools')} key="Tools"><span className="surface-num">03</span><div><small>tool registry</small><h3>Tools</h3><p>Browse the engineering tools available to the orchestration layer.</p></div><b>↗</b></button><button className="surface-card" onClick={()=>go('History')} key="History"><span className="surface-num">04</span><div><small>operational memory</small><h3>History</h3><p>Open previous runs, traces, artifacts, and execution scores.</p></div><b>↗</b></button>
      </div>
    </section>

    <section className="tech-ribbon reveal" data-reveal>
      <div className="eyebrow">05 / TECHNOLOGY SURFACE</div>
      <div className="marquee" aria-label="CYRUS technology stack">
        <div className="marquee-track">
          <span>PYTHON<i>✦</i></span><span>FLASK<i>✦</i></span><span>REACT<i>✦</i></span><span>JAVASCRIPT<i>✦</i></span><span>REST API<i>✦</i></span><span>LOCAL PERSISTENCE<i>✦</i></span><span>GITHUB ACTIONS<i>✦</i></span><span>GITHUB PAGES<i>✦</i></span><span>OBSERVABILITY<i>✦</i></span><span>AGENT ORCHESTRATION<i>✦</i></span>
          <span>PYTHON<i>✦</i></span><span>FLASK<i>✦</i></span><span>REACT<i>✦</i></span><span>JAVASCRIPT<i>✦</i></span><span>REST API<i>✦</i></span><span>LOCAL PERSISTENCE<i>✦</i></span><span>GITHUB ACTIONS<i>✦</i></span><span>GITHUB PAGES<i>✦</i></span><span>OBSERVABILITY<i>✦</i></span><span>AGENT ORCHESTRATION<i>✦</i></span>
        </div>
      </div>
    </section>

    <section className="closing-cta reveal" data-reveal>
      <div><div className="eyebrow">06 / NEXT OBJECTIVE</div><h2>Give CYRUS something worth shipping.</h2><p>Define the objective. Choose the control mode. Watch the agent graph move.</p></div>
      <button className="primary-cta" onClick={()=>document.querySelector('.command-panel')?.scrollIntoView({behavior:'smooth'})}>Open command surface ↗</button>
    </section>

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
function CommandPalette({page,go,execute,seedObjective,notify,close}){const [query,setQuery]=useState('');const [cursor,setCursor]=useState(0);const actions=[...NAV_ITEMS.map(item=>({label:item,type:'surface',run:()=>go(item)})),{label:'Run example objective',type:'action',run:()=>{setQuery('');close();notify('Launching the example objective');setTimeout(()=>execute(),80)}}];const items=useMemo(()=>actions.filter(x=>x.label.toLowerCase().includes(query.toLowerCase())),[query]);useEffect(()=>setCursor(0),[query]);useEffect(()=>{const onKey=e=>{if(e.key==='ArrowDown'){e.preventDefault();setCursor(i=>items.length?(i+1)%items.length:0)}if(e.key==='ArrowUp'){e.preventDefault();setCursor(i=>items.length?(i-1+items.length)%items.length:0)}if(e.key==='Enter'&&items[cursor]){e.preventDefault();items[cursor].run()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[items,cursor]);return <div className="command-palette-back" onClick={close}><div className="command-palette" onClick={e=>e.stopPropagation()}><div className="palette-head"><span className="eyebrow">COMMAND</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Jump to a CYRUS surface or run an action..." /></div><div className="palette-list">{items.length?items.map((item,i)=><button key={item.label} className={'palette-item '+(cursor===i?'active':'')} onMouseEnter={()=>setCursor(i)} onClick={item.run}><span>{item.label}</span><small>{cursor===i?(item.type==='action'?'ENTER · RUN':'ENTER · OPEN'):(item.type==='action'?'EXECUTE':'SURFACE')}</small></button>):<div className="empty">No CYRUS command matches that query.</div>}</div></div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>)

