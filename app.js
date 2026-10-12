const {useEffect,useMemo,useRef,useState}=React

const API_TIMEOUT_MS=6500
const NAV_ITEMS=['Home','Command','Agents','Memory','Tools','History']

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

const CYRUS_IMAGES={"command":"https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1800&q=85","agents":"https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1400&q=85","memory":"https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1400&q=85","tools":"https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=85","history":"https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1400&q=85","spotlight":"https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1400&q=85","orchestration":"https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1400&q=85","code":"https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=900&q=85","circuit":"https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=85","servers":"https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=85","automation":"https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=85","research":"https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=85","memoryCard":"https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=900&q=85"}

function App(){
  const [page,setPage]=useState('Home')
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
  const [motionEnabled,setMotionEnabled]=useState(()=>{try{return localStorage.getItem('cyrus-motion')!=='off'}catch{return true}})

  const notify=message=>{setToast(message);window.clearTimeout(window.__cyrusToastTimer);window.__cyrusToastTimer=window.setTimeout(()=>setToast(''),2500)}
  const toggleMotion=()=>{
    const next=!motionEnabled
    setMotionEnabled(next)
    try{localStorage.setItem('cyrus-motion',next?'on':'off')}catch{}
    notify(next?'Immersive motion enabled':'Calm mode enabled')
  }
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
    const root=document.querySelector('.main')
    if(!root)return
    const systemReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const reduced=systemReduced||!motionEnabled
    document.documentElement.classList.toggle('motion-disabled',reduced)
    const revealSelector=[
      '.nx-hero','.nx-console','.nx-signal','.nx-workbench','.nx-observability','.nx-capabilities','.nx-bottom-cta',
      '.editorial-hero','.page-stat-rail','.page-section','.page-spotlight','.tool-category-grid','.memory-retention-note',
      '.history-overview','.history-console','.registry-card','.tool-library-card','.memory-gallery-card','.history-stat','.nx-cap-card'
    ].join(',')
    const revealNodes=[...new Set(root.querySelectorAll(revealSelector))]
    let observer=null
    if(reduced||!('IntersectionObserver' in window)){
      revealNodes.forEach(node=>node.classList.add('motion-in'))
    }else{
      revealNodes.forEach((node,index)=>{
        node.classList.add('motion-reveal')
        node.style.setProperty('--motion-delay',Math.min(index%6,5)*55+'ms')
      })
      observer=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{
          if(entry.isIntersecting){
            entry.target.classList.add('motion-in')
            observer.unobserve(entry.target)
          }
        })
      },{threshold:.06,rootMargin:'0px 0px -32px 0px'})
      revealNodes.forEach(node=>observer.observe(node))
    }

    const tiltSelector=[
      '.nx-hero','.editorial-hero','.nx-console','.nx-panel','.nx-signal','.nx-cap-card',
      '.registry-card','.tool-category-grid article','.tool-library-card','.memory-gallery-card','.page-spotlight',
      '.history-stat','.history-console'
    ].join(',')
    const tiltNodes=[...new Set(root.querySelectorAll(tiltSelector))]
    const listeners=[]
    if(!reduced&&window.matchMedia('(pointer:fine)').matches){
      tiltNodes.forEach(node=>{
        node.classList.add('motion-tilt')
        const strength=node.matches('.nx-hero,.editorial-hero')?1.15:node.matches('.nx-console,.history-console,.page-spotlight')?1.8:3.1
        const onMove=event=>{
          const rect=node.getBoundingClientRect()
          if(!rect.width||!rect.height)return
          const x=(event.clientX-rect.left)/rect.width
          const y=(event.clientY-rect.top)/rect.height
          const rx=(.5-y)*strength*2
          const ry=(x-.5)*strength*2
          node.style.setProperty('--motion-rotate-x',rx.toFixed(2)+'deg')
          node.style.setProperty('--motion-rotate-y',ry.toFixed(2)+'deg')
          node.style.setProperty('--motion-origin-x',(x*100).toFixed(1)+'%')
          node.style.setProperty('--motion-origin-y',(y*100).toFixed(1)+'%')
          node.style.setProperty('--motion-image-x',((.5-x)*14).toFixed(2)+'px')
          node.style.setProperty('--motion-image-y',((.5-y)*10).toFixed(2)+'px')
          node.classList.add('is-tilting')
        }
        const onLeave=()=>{
          node.classList.remove('is-tilting')
          node.style.removeProperty('--motion-rotate-x')
          node.style.removeProperty('--motion-rotate-y')
          node.style.removeProperty('--motion-origin-x')
          node.style.removeProperty('--motion-origin-y')
          node.style.removeProperty('--motion-image-x')
          node.style.removeProperty('--motion-image-y')
        }
        node.addEventListener('pointermove',onMove,{passive:true})
        node.addEventListener('pointerleave',onLeave,{passive:true})
        listeners.push(()=>{node.removeEventListener('pointermove',onMove);node.removeEventListener('pointerleave',onLeave);onLeave();node.classList.remove('motion-tilt')})
      })
    }

    let frame=0
    const updateProgress=()=>{
      const maximum=Math.max(1,document.documentElement.scrollHeight-window.innerHeight)
      const progress=Math.max(0,Math.min(100,(window.scrollY/maximum)*100))
      document.documentElement.style.setProperty('--motion-scroll-progress',progress.toFixed(2)+'%')
    }
    const onScroll=()=>{
      if(frame)return
      frame=window.requestAnimationFrame(()=>{frame=0;updateProgress()})
    }
    updateProgress()
    window.addEventListener('scroll',onScroll,{passive:true})
    return()=>{
      observer?.disconnect()
      listeners.forEach(cleanup=>cleanup())
      window.removeEventListener('scroll',onScroll)
      if(frame)window.cancelAnimationFrame(frame)
      document.documentElement.classList.remove('motion-disabled')
    }
  },[page,motionEnabled])
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

  return <div className={'app-shell '+(page==='Home'?'home-shell':'workspace-shell')}>
    <div className="motion-progress" aria-hidden="true"/>
    {page==='Home'&&<HomeView go={go} runtimeState={runtimeState} busy={busy} agents={agents} openPalette={()=>setPaletteOpen(true)}/>}
    {page!=='Home'&&<>
      <aside className="sidebar workspace-sidebar">
        <button className="brand" onClick={()=>go('Home')} aria-label="Open CYRUS home">
          <span className="brand-mark"><span/></span>
          <span><strong>CYRUS</strong><small>AUTONOMOUS INTELLIGENCE</small></span>
        </button>
        <nav className="nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>go(item)}>
            <span className="nav-icon" aria-hidden="true">{({'Home':'⌂','Command':'⌘','Agents':'♙','Memory':'◫','Tools':'⌘','History':'◷'})[item]}</span>
            <span className="label">{item}</span><span className="num">{String(i+1).padStart(2,'0')}</span>
          </button>)}
        </nav>
        <div className="side-foot"><span className="dot"/><div><strong>System Online</strong><small>All systems operational</small></div></div>
      </aside>
      <main className="main workspace-main">
        <div className="topbar">
          <div className="eyebrow">CYRUS / {page.toUpperCase()} WORKSPACE</div>
          <div className="top-actions">
            <button className={'motion-toggle '+(motionEnabled?'active':'')} type="button" aria-pressed={motionEnabled} onClick={toggleMotion} title="Toggle motion effects"><span className="motion-toggle-icon" aria-hidden="true">{motionEnabled?'◉':'◌'}</span><span>{motionEnabled?'MOTION ON':'CALM MODE'}</span></button>
            <div className="live-pill"><span className="dot"/>{runtimeState} · {busy?'RUNNING':'READY'}</div>
            <button className="nav-command" onClick={()=>setPaletteOpen(true)}>⌘ K</button>
          </div>
        </div>
        {page==='Command'&&<CommandView {...{prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents:task?.agents||agents.map(a=>({...a,status:'QUEUED'})),metrics:task?[
          ['EXECUTION',task.execution_time_ms?task.execution_time_ms+' ms':'—'],['TOOLS',task.tool_calls||0],['CONFIDENCE',task.confidence?task.confidence+'%':'—'],['RISK',task.risk||'—'],
          ['RELEASE',task.status==='COMPLETED'?'READY':'STANDBY'],['QUALITY',task.quality?task.quality+'%':'—'],['COVERAGE',task.coverage?task.coverage+'%':'—'],['LATENCY',task.latency_ms?task.latency_ms+' ms':'—']
        ]:[['EXECUTION','—'],['TOOLS','—'],['CONFIDENCE','—'],['RISK','—'],['RELEASE','STANDBY'],['QUALITY','—'],['COVERAGE','—'],['LATENCY','—']],seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics,go,tasks,open:openTask}}/>}
        {page==='Agents'&&<AgentsView agents={agents}/>}
        {page==='Memory'&&<MemoryView tasks={tasks} open={openTask} go={go}/>}
        {page==='Tools'&&<ToolsView tools={tools}/>}
        {page==='History'&&<HistoryView tasks={tasks} open={openTask}/>}
      </main>
    </>}
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

function CyrusCharacter({busy=false,runtimeState='ONLINE',currentAgents=[],go=()=>{}}){
  return (
    <div className="nx-hero-visual cyrus-hero-visual">
        <div className="cyrus-atmosphere" aria-hidden="true"><i/><i/><i/><span/></div>
        <div className="cyrus-visual-label"><span className="cyrus-live-pip"/><span>CYRUS / CHARACTER FILE 07</span><b>FICTIONAL AI</b></div>
        <svg className="cyrus-portrait" viewBox="0 0 760 900" role="img" aria-labelledby="cyrus-portrait-title cyrus-portrait-desc">
          <title id="cyrus-portrait-title">CYRUS, an original fictional AI character</title>
          <desc id="cyrus-portrait-desc">A cinematic, original dark-haired synthetic intelligence with glowing teal eyes, a black armored coat, luminous circuitry, and a geometric core emblem.</desc>
          <defs>
            <linearGradient id="cyrus-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#071b25"/><stop offset=".5" stopColor="#07101b"/><stop offset="1" stopColor="#020509"/></linearGradient>
            <linearGradient id="cyrus-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9c8c8"/><stop offset=".36" stopColor="#60747a"/><stop offset=".72" stopColor="#243640"/><stop offset="1" stopColor="#0b1821"/></linearGradient>
            <linearGradient id="cyrus-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b3138"/><stop offset=".45" stopColor="#080f16"/><stop offset="1" stopColor="#020509"/></linearGradient>
            <linearGradient id="cyrus-armor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38515a"/><stop offset=".24" stopColor="#172830"/><stop offset=".56" stopColor="#08131b"/><stop offset="1" stopColor="#020609"/></linearGradient>
            <linearGradient id="cyrus-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#91b5b5"/><stop offset=".2" stopColor="#29424a"/><stop offset=".5" stopColor="#101c24"/><stop offset="1" stopColor="#05090e"/></linearGradient>
            <linearGradient id="cyrus-energy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bcfff0"/><stop offset=".4" stopColor="#38f1c6"/><stop offset="1" stopColor="#00a9d0"/></linearGradient>
            <radialGradient id="cyrus-halo"><stop offset="0" stopColor="#25e8c0" stopOpacity=".32"/><stop offset=".5" stopColor="#0c8294" stopOpacity=".13"/><stop offset="1" stopColor="#06111b" stopOpacity="0"/></radialGradient>
            <filter id="cyrus-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <pattern id="cyrus-microgrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#65e6d1" strokeOpacity=".1" strokeWidth=".7"/></pattern>
          </defs>
          <rect width="760" height="900" fill="url(#cyrus-sky)" opacity=".45"/>
          <ellipse cx="440" cy="380" rx="320" ry="390" fill="url(#cyrus-halo)"/>
          <rect x="0" y="0" width="760" height="900" fill="url(#cyrus-microgrid)" opacity=".48"/>
          <g fill="none" stroke="#43e8cf" strokeOpacity=".23">
            <circle cx="437" cy="360" r="262" strokeWidth="1.2"/>
            <circle cx="437" cy="360" r="292" strokeDasharray="2 12"/>
            <ellipse cx="437" cy="360" rx="190" ry="298" transform="rotate(28 437 360)"/>
            <path d="M45 600L180 465 245 465M545 166H660V282M570 650H700V755"/>
          </g>
          <g fill="#4ce8d0" opacity=".65"><circle cx="180" cy="465" r="3"/><circle cx="660" cy="282" r="3"/><circle cx="700" cy="755" r="3"/></g>
          <path d="M96 900L115 736Q133 642 223 589L300 550 491 550 594 589Q677 642 690 758L710 900Z" fill="#02060a" stroke="#1e444b" strokeWidth="2"/>
          <path d="M206 900L224 718Q240 629 302 598L372 575 475 581 546 613Q601 650 610 754L626 900Z" fill="url(#cyrus-armor)" stroke="#38565d" strokeWidth="2"/>
          <path d="M293 586L332 534 479 528 525 585 481 640 359 644Z" fill="#0a1720" stroke="#3a6568" strokeWidth="2"/>
          <path d="M347 492L344 569 386 610 437 612 485 569 475 485Z" fill="url(#cyrus-face)"/>
          <path d="M340 540L386 568 475 529 480 581 435 635 367 624 329 583Z" fill="#050d13" stroke="#2b5057" strokeWidth="2"/>
          <path d="M269 296Q276 184 375 150Q479 120 541 205L562 307 540 405Q525 459 474 497L436 521 374 493Q317 462 287 400Z" fill="url(#cyrus-face)" stroke="#8ba7a8" strokeOpacity=".25" strokeWidth="2"/>
          <path d="M269 286Q245 195 317 131Q368 82 438 103Q507 76 557 150Q603 206 559 323L535 286 517 233 482 201 426 224 365 205 317 256 297 330Z" fill="url(#cyrus-hair)" stroke="#29464c" strokeWidth="2"/>
          <path d="M295 287Q267 199 334 131L363 116 344 166 377 127 373 178 416 111 407 171 456 121 444 183 488 161 493 205 528 199 540 268 551 316 526 286 503 236 477 214 426 236 368 213 330 261 312 329Z" fill="#071118"/>
          <path d="M311 291L296 361 314 406 340 418 334 371 350 314Z" fill="#20343c" opacity=".8"/>
          <path d="M335 312Q358 284 392 299L410 313 384 321 355 321Z" fill="#08151b"/>
          <path d="M432 300Q465 276 494 294L508 310 477 315 449 313Z" fill="#08151b"/>
          <path d="M339 319L379 316 391 323 375 328 345 327Z" fill="url(#cyrus-energy)" filter="url(#cyrus-glow)"/>
          <path d="M447 314L489 308 500 315 481 323 451 322Z" fill="url(#cyrus-energy)" filter="url(#cyrus-glow)"/>
          <path d="M410 318L398 362 419 371 432 361" fill="none" stroke="#263f47" strokeWidth="5" strokeLinecap="round"/>
          <path d="M396 397Q426 410 455 390" fill="none" stroke="#162d35" strokeWidth="4" strokeLinecap="round"/>
          <path d="M381 405L418 414 450 396 441 432 411 448 385 430Z" fill="#0c1a21" stroke="#2b4a50" strokeWidth="2"/>
          <path d="M304 366Q320 405 344 433L370 465 393 475 368 487Q320 461 294 407L286 361Z" fill="#1b2d35" opacity=".78"/>
          <path d="M497 274Q516 304 503 358L487 393 510 379 531 333 527 277Z" fill="#02090f" opacity=".8"/>
          <path d="M207 651L277 605 329 630 347 702 313 771 219 780 180 717Z" fill="url(#cyrus-metal)" stroke="#4d7477" strokeWidth="2"/>
          <path d="M501 628L541 603 603 641 640 717 594 772 517 761 483 706Z" fill="url(#cyrus-metal)" stroke="#45676b" strokeWidth="2"/>
          <path d="M233 661L283 631 312 657 324 711 291 748 231 741 207 708Z" fill="#07131b" stroke="#2e5459" strokeWidth="2"/>
          <path d="M527 655L552 631 588 657 615 712 583 743 530 735 508 699Z" fill="#07131b" stroke="#2e5459" strokeWidth="2"/>
          <path d="M263 647L285 635 300 656 279 671Z" fill="url(#cyrus-energy)" filter="url(#cyrus-glow)"/>
          <path d="M549 643L564 632 580 652 563 666Z" fill="url(#cyrus-energy)" filter="url(#cyrus-glow)"/>
          <path d="M341 652L359 628 384 643 374 719 351 758 332 707Z" fill="#071016" stroke="#3c6267" strokeWidth="2"/>
          <path d="M465 638L486 628 507 651 511 716 485 751 467 700Z" fill="#071016" stroke="#3c6267" strokeWidth="2"/>
          <path d="M378 648L422 627 461 649 456 736 420 770 384 734Z" fill="#0b1a22" stroke="#42676b" strokeWidth="2"/>
          <path d="M401 665L421 652 441 666 436 700 420 713 405 699Z" fill="url(#cyrus-energy)" opacity=".9" filter="url(#cyrus-glow)"/>
          <path d="M420 672L429 681 420 691 411 681Z" fill="#e0fff8"/>
          <path d="M341 694L326 761 358 817M487 696L502 764 478 817M384 736L374 817M455 736L464 817" fill="none" stroke="#34d7bd" strokeOpacity=".7" strokeWidth="3"/>
          <path d="M235 799L318 836 384 850 420 831 469 842 545 802 570 900H192Z" fill="#03070b" stroke="#28474d" strokeWidth="2"/>
          <path d="M265 815L346 852 384 850M553 815L469 854 423 849" fill="none" stroke="#52f4d5" strokeOpacity=".55" strokeWidth="2"/>
          <g fill="none" stroke="url(#cyrus-energy)" strokeWidth="2.5" strokeLinecap="round" filter="url(#cyrus-glow)">
            <path d="M225 672L248 692 249 731 274 748"/>
            <path d="M576 665L556 692 564 723 587 736"/>
            <path d="M348 605L364 620 359 652"/>
            <path d="M486 598L470 616 479 649"/>
          </g>
          <g stroke="#aac9c8" strokeOpacity=".25" fill="none">
            <path d="M250 625L286 602 310 619M526 615L552 603 584 624"/>
            <path d="M352 764L368 787 368 817M480 765L462 789 462 817"/>
            <path d="M315 444L341 466 365 474M490 437L473 462 450 474"/>
          </g>
          <text x="420" y="881" textAnchor="middle" fill="#69ead6" fontSize="12" letterSpacing="5" opacity=".85">CYRUS / CORE 07</text>
        </svg>
        <div className="cyrus-nameplate"><small>INTELLIGENCE ENTITY</small><strong>CYRUS<span>—07</span></strong><em>SELF-AWARENESS: SIMULATED</em></div>
        <div className="cyrus-hud cyrus-hud-left"><span>01 / REASONING</span><b><i/> ONLINE</b><small>Objective decomposition</small></div>
        <div className="cyrus-hud cyrus-hud-right"><span>02 / EXECUTION</span><b>{busy?'ACTIVE':'STANDBY'}</b><small>{currentAgents.length} agents · {runtimeState}</small></div>
        <div className="cyrus-scroll-cue"><span>SCROLL TO MEET THE SYSTEM</span><i/></div>
      </div>
  )
}

function HomeView({go,runtimeState,busy,agents,openPalette}){
  const highlights=[
    ['◈','Multi-Agent System','Specialized agents',()=>go('Agents')],
    ['⌘','Tool Integration','Runtime capabilities',()=>go('Tools')],
    ['◫','Memory System','Persistent execution history',()=>go('Memory')],
    ['◉','Autonomous Execution','Plan → Act → Verify',()=>go('Command')]
  ];
  return <main className="main home-main">
    <header className="home-navigation">
      <button className="home-brand" onClick={()=>go('Home')} aria-label="CYRUS home"><span className="home-brand-symbol">◆</span><span><strong>CYRUS</strong><small>AUTONOMOUS AGENTIC INTELLIGENCE SYSTEM</small></span></button>
      <nav aria-label="Primary navigation">{NAV_ITEMS.map((item,i)=><button key={item} className={item==='Home'?'active':''} onClick={()=>go(item)}>{item}</button>)}</nav>
      <div className="home-nav-tools"><span className="home-status"><i/>{runtimeState}</span><button className="home-command-key" onClick={openPalette}>⌘ K</button></div>
    </header>
    <section className="home-hero">
      <div className="home-hero-backdrop" aria-hidden="true"><span/><i/><i/><i/></div>
      <div className="home-hero-copy">
        <div className="home-eyebrow"><i/> AUTONOMOUS AGENTIC INTELLIGENCE SYSTEM</div>
        <h1>I am <span>CYRUS.</span></h1>
        <h2>Think. Plan. Execute. Evolve.</h2>
        <p>I am CYRUS — a fictional autonomous AI built to turn your ideas into real outcomes. I use advanced reasoning, powerful tools and a coordinated network of specialized agents to solve complex problems, execute tasks and keep learning.</p>
        <div className="home-hero-actions">
          <button className="home-primary" onClick={()=>go('Command')}>Enter Command <b>→</b></button>
          <button className="home-secondary" onClick={()=>{go('Command');setTimeout(()=>document.querySelector('.command-objective')?.focus(),120)}}><span>▷</span> Watch the system</button>
        </div>
        <div className="home-character-caption"><span>CYRUS-07</span><i/> <span>FICTIONAL INTELLIGENCE / ACTIVE</span></div>
      </div>
      <div className="home-hero-character"><CyrusCharacter busy={busy} runtimeState={runtimeState} currentAgents={agents} go={go}/></div>
      <div className="home-feature-rail">{highlights.map(([icon,title,sub,action],i)=><button className="home-feature" key={title} onClick={action}><span className="home-feature-icon">{icon}</span><span><strong>{title}</strong><small>{sub}</small></span><b>↗</b></button>)}</div>
      <div className="home-scroll-cue"><span>SCROLL TO EXPLORE</span><i/></div>
    </section>
    <section className="home-next-section">
      <div className="home-section-label">01 / THE CYRUS SYSTEM</div>
      <div className="home-next-heading"><h2>One objective.<br/><em>Seven minds. One outcome.</em></h2><p>Move from first idea to traceable delivery inside one coordinated workspace, with every stage visible and every result inspectable.</p></div>
      <div className="home-surface-grid">{[
        ['01','Command','Give CYRUS a mission and choose autonomous or supervised execution.','Command'],
        ['02','AI Agents','Explore the specialist roles that plan, research, build and verify.','Agents'],
        ['03','Memory','Reopen previous runs, inspect outcomes and search the execution archive.','Memory'],
        ['04','Tools','Explore the capabilities and routes exposed by the runtime.','Tools'],
        ['05','Execution History','Filter, review and export your recorded task history.','History']
      ].map(([num,title,desc,target])=><button className="home-surface-card" key={target} onClick={()=>go(target)}><span>{num} / SURFACE</span><h3>{title}</h3><p>{desc}</p><b>Open surface ↗</b></button>)}</div>
      <footer className="home-footer"><span>CYRUS-07 / ORIGINAL FICTIONAL AI CHARACTER</span><span>{runtimeState} · {busy?'EXECUTING':'READY'}</span></footer>
    </section>
  </main>
}

function CommandView({prompt,setPrompt,mode,setMode,execute,busy,task,currentAgents,metrics,seedObjective,notify,approveTask,cancelTask,runtimeState,runtimeMetrics,go,tasks=[],open}){
  const [advanced,setAdvanced]=useState(false);
  const [filter,setFilter]=useState('ALL');
  const [search,setSearch]=useState('');
  const recent=useMemo(()=>tasks.filter(item=>{
    const q=search.trim().toLowerCase();
    return (!q||[item.objective,item.task_id,item.status].filter(Boolean).join(' ').toLowerCase().includes(q))
      &&(filter==='ALL'||String(item.status||'UNKNOWN').toUpperCase()===filter);
  }).slice(0,5),[tasks,search,filter]);
  const count=status=>tasks.filter(item=>String(item.status||'').toUpperCase()===status).length;
  const stats=[
    ['Total Executions',runtimeMetrics?.persisted_tasks??tasks.length,'teal','◈'],
    ['Active',runtimeMetrics?.active_tasks??(busy?1:0),'cyan','◉'],
    ['Awaiting Approval',runtimeMetrics?.awaiting_approval??count('AWAITING_APPROVAL'),'amber','◷'],
    ['Completed',runtimeMetrics?.completed_tasks??count('COMPLETED'),'green','✓'],
    ['Failed',runtimeMetrics?.failed_tasks??count('FAILED'),'red','!']
  ];
  const graph=[
    ['Planner','01','planner'],['Researcher','02','researcher'],['Coder','03','coder'],['Tester','04','tester'],['Analyst','05','analyst']
  ];
  return <div className="workspace-page command-page">
    <section className="command-stage">
      <div className="command-stage-copy">
        <div className="page-breadcrumb"><span>⌘</span> / Command</div>
        <div className="command-kicker">CYRUS / OBJECTIVE EXECUTION</div>
        <h1>Command</h1><p>Turn your ideas into autonomous action.</p>
        <div className="command-entry-panel">
          <label htmlFor="command-objective">What would you like CYRUS to do?</label>
          <textarea id="command-objective" className="command-objective" value={prompt} maxLength={4000} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();execute()}}} placeholder="e.g. Build a web application, analyze data, or automate a workflow…"/>
          <div className="command-entry-controls">
            <label className="command-mode-label">Mode
              <select value={mode} onChange={e=>setMode(e.target.value)} aria-label="Execution mode"><option value="autonomous">Autonomous</option><option value="supervised">Supervised</option></select>
            </label>
            <button className="command-advanced-toggle" onClick={()=>setAdvanced(v=>!v)} aria-expanded={advanced}>{advanced?'−':'＋'} Advanced Options</button>
            <button className="command-execute" disabled={busy} onClick={execute}>{busy?'Executing…':'Execute'} <b>↗</b></button>
          </div>
          {advanced&&<div className="command-advanced-panel"><span>OBJECTIVE LENGTH <b>{prompt.length.toLocaleString()} / 4,000</b></span><span>CONTROL MODE <b>{mode.toUpperCase()}</b></span><span>RUNTIME <b>{runtimeState}</b></span><button onClick={()=>{setPrompt(seedObjective);notify('Example objective loaded')}}>Load example objective</button></div>}
          {task&&<div className="command-current-task"><span className="command-task-dot"/><span>Last execution</span><b>{task.status}</b><small>{task.task_id}</small>{task.status==='AWAITING_APPROVAL'&&<button onClick={approveTask}>Approve release</button>}{busy&&task.status==='RUNNING'&&<button onClick={cancelTask}>Stop run</button>}</div>}
        </div>
      </div>
      <div className="command-stage-character">
        <div className="command-portrait-wash"/>
        <CyrusCharacter busy={busy} runtimeState={runtimeState} currentAgents={currentAgents} go={go}/>
        <div className="command-character-quote"><span>CYRUS-07 / SYSTEM PRINCIPLE</span><strong>Better decisions.<br/>Faster execution.</strong><small>FICTIONAL INTELLIGENCE · {runtimeState}</small></div>
      </div>
    </section>
    <section className="command-stats-grid" aria-label="Execution summary">{stats.map(([label,value,accent,icon])=><article className={'command-stat '+accent} key={label}><span className="command-stat-icon">{icon}</span><div><small>{label}</small><strong>{value??0}</strong></div>{label==='Awaiting Approval'&&Number(value)>0&&<i className="stat-attention"/>}</article>)}</section>
    <section className="command-lower-grid">
      <article className="command-panel recent-panel">
        <div className="command-panel-head"><div><span className="command-panel-kicker">ACTIVITY / 01</span><h2>Recent Executions</h2></div><button onClick={()=>go('History')}>View All ↗</button></div>
        <div className="recent-controls"><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search recent executions" placeholder="Search recent runs…"/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter recent executions"><option value="ALL">All statuses</option><option value="RUNNING">Running</option><option value="AWAITING_APPROVAL">Awaiting approval</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select></div>
        {recent.length?<div className="recent-list">{recent.map(item=><button className="recent-row" key={item.task_id} onClick={()=>open(item)}><span className={'recent-row-icon '+String(item.status||'unknown').toLowerCase()}>{String(item.status||'?').toUpperCase()==='COMPLETED'?'✓':String(item.status||'?').toUpperCase()==='FAILED'?'!':'◷'}</span><span className="recent-row-copy"><strong>{item.objective||'Untitled execution'}</strong><small>{item.task_id} · {item.current_agent||'CYRUS'}</small></span><span className={'recent-row-status '+String(item.status||'unknown').toLowerCase()}>{String(item.status||'UNKNOWN').replaceAll('_',' ')}</span><time>{item.created_at?new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'}</time></button>)}</div>:<div className="command-empty-state"><span>◈</span><strong>No matching executions yet</strong><p>Run an objective above and its status will appear here.</p></div>}
      </article>
      <article className="command-panel agent-graph-panel">
        <div className="command-panel-head"><div><span className="command-panel-kicker">ORCHESTRATION / 02</span><h2>Live Agent Graph</h2></div><button onClick={()=>go('Agents')}>Inspect ↗</button></div>
        <div className="agent-map">
          <svg viewBox="0 0 520 260" className="agent-map-lines" aria-hidden="true"><path d="M260 130L143 66M260 130L377 66M260 130L115 151M260 130L405 151M260 130L260 214M143 66L377 66M115 151L260 214M405 151L260 214" fill="none" stroke="currentColor" strokeOpacity=".24" strokeWidth="1.3"/><circle cx="260" cy="130" r="80" fill="none" stroke="currentColor" strokeOpacity=".1" strokeDasharray="3 8"/></svg>
          <button className="agent-map-core" onClick={()=>go('Command')}><span>◆</span><strong>CYRUS</strong><small>CORE / 07</small></button>
          {graph.map(([name,id,pos])=><button className={'agent-map-node '+pos} key={id} onClick={()=>go('Agents')}><span>{id}</span><b>{name}</b></button>)}
          <div className="agent-map-legend"><span><i/>Active</span><span><i/>Idle</span><span><i/>Processing</span></div>
        </div>
        <div className="agent-graph-foot"><span>{currentAgents.length||7} registered agents</span><span><i/>{busy?'Execution in progress':'Ready for objective'}</span></div>
      </article>
    </section>
    {task?.events?.length>0&&<section className="command-panel command-live-trace"><div className="command-panel-head"><div><span className="command-panel-kicker">EXECUTION / LIVE TRACE</span><h2>Latest signal</h2></div><span className="command-trace-count">{task.events.length} events</span></div>{task.events.slice(-5).map((event,i)=><div className="command-trace-row" key={event.event_id||i}><b>{event.agent}</b><span>{event.phase}</span><p>{event.message}</p><small>{event.duration} ms</small></div>)}</section>}
  </div>
}

function PageHero({eyebrow,title,accent,description,image,alt,meta,imageCaption}){
  return <section className="editorial-hero">
    <div className="editorial-hero-copy">
      <div className="editorial-kicker"><i/>{eyebrow}</div>
      <h1>{title}<span>{accent}</span></h1>
      <p>{description}</p>
      <div className="editorial-hero-meta"><span><i/>CYRUS WORKSPACE</span>{meta&&<b>{meta}</b>}</div>
    </div>
    <figure className="editorial-hero-media">
      <img src={image} alt={alt} loading="lazy"/>
      <div className="editorial-hero-shade"/>
      <figcaption><span>VISUAL SYSTEM / CYRUS</span><b>{imageCaption||eyebrow}</b></figcaption>
    </figure>
  </section>
}

function AgentsView({agents}){
  const defaults=[
    {id:1,name:'ORCHESTRATOR',type:'CORE',role:'Coordination',responsibility:'Routes the objective, maintains shared context and keeps the execution graph accountable.'},
    {id:2,name:'PLANNER',type:'REASONING',role:'Decomposition',responsibility:'Turns broad requirements into ordered steps, dependencies and measurable acceptance criteria.'},
    {id:3,name:'RESEARCHER',type:'INTELLIGENCE',role:'Evidence',responsibility:'Collects context, examines constraints and surfaces evidence before implementation.'},
    {id:4,name:'CODER',type:'BUILD',role:'Implementation',responsibility:'Translates approved plans into focused artifacts and practical engineering changes.'},
    {id:5,name:'TESTER',type:'QUALITY',role:'Validation',responsibility:'Checks behavior against acceptance criteria and identifies regressions before release.'},
    {id:6,name:'REVIEWER',type:'ASSURANCE',role:'Risk review',responsibility:'Evaluates quality, risk and release readiness before the final decision.'},
    {id:7,name:'RELEASE',type:'DELIVERY',role:'Handoff',responsibility:'Packages the outcome with status, trace evidence and release-oriented artifacts.'}
  ];
  const list=agents.length?agents:defaults;
  const photos=['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85'];
  const completed=list.filter(a=>String(a.status||'READY').toUpperCase()==='COMPLETED').length;
  return <div className="section-page page-agents">
    <PageHero eyebrow="AI AGENTS / SPECIALIST REGISTRY" title="AI" accent=" Agents" description="Specialized agents. Unified purpose. Each specialist contributes a defined capability while CYRUS keeps the workflow observable." image={CYRUS_IMAGES.agents} alt="Robotics and intelligent systems hardware" meta={list.length+' AGENT DEFINITIONS'} imageCaption="THE AGENT WORKBENCH"/>
    <div className="page-stat-rail">
      <div className="page-stat"><span>REGISTERED AGENTS</span><strong>{String(list.length).padStart(2,'0')}</strong><small>One coordinated system</small></div>
      <div className="page-stat"><span>EXECUTION STAGES</span><strong>07</strong><small>From intent to delivery</small></div>
      <div className="page-stat"><span>SHARED CONTEXT</span><strong>01</strong><small>Common execution record</small></div>
      <div className="page-stat"><span>COMPLETED STATES</span><strong>{String(completed).padStart(2,'0')}</strong><small>From current registry data</small></div>
    </div>
    <section className="page-section">
      <div className="section-heading"><div><span className="editorial-kicker">THE SPECIALIST LINEUP</span><h2>Clear roles. <em>Connected outcomes.</em></h2></div><p>Move from strategy and evidence through implementation, quality checks and release.</p></div>
      <div className="registry-grid">{list.map((a,i)=><article className="registry-card" key={a.id||a.name}>
        <div className="registry-card-media"><img src={photos[i%photos.length]} alt="" loading="lazy"/><span className="registry-index">{String(i+1).padStart(2,'0')} / {String(a.type||a.role||'AGENT').toUpperCase()}</span><span className="registry-ready"><i/>READY</span></div>
        <div className="registry-card-body"><div className="registry-role">{String(a.role||a.type||'SPECIALIST').toUpperCase()}</div><h3>{a.name}</h3><p>{a.responsibility||a.description||'A dedicated capability inside the CYRUS execution graph.'}</p><div className="registry-card-foot"><span>CAPABILITY PROFILE</span><b>↗</b></div></div>
      </article>)}</div>
    </section>
    <section className="page-spotlight">
      <img src={CYRUS_IMAGES.orchestration} alt="Engineering team collaborating around a shared system" loading="lazy"/>
      <div><span className="editorial-kicker">THE OPERATING PRINCIPLE</span><h2>Independent skills.<br/><em>Shared accountability.</em></h2><p>CYRUS presents the run as one system: individual stages are inspectable, but the final outcome remains tied to a single objective and trace.</p><div className="spotlight-pills"><span>Context-aware</span><span>Traceable</span><span>Release-focused</span></div></div>
    </section>
  </div>
}

function toolGroup(tool){
  const value=[tool.name,tool.category,tool.route,tool.description].filter(Boolean).join(' ').toLowerCase();
  if(/research|web|search|http|api/.test(value))return 'Web & APIs';
  if(/file|repository|database|data|storage/.test(value))return 'Data';
  if(/code|test|analy|audit|scanner|inspect/.test(value))return 'Development';
  if(/artifact|email|message|report|delivery/.test(value))return 'Productivity';
  return 'System';
}

function ToolsView({tools}){
  const [category,setCategory]=useState('All');
  const [query,setQuery]=useState('');
  const defaults=[
    {name:'Repository Scanner',category:'analysis',route:'repo.scan',description:'Maps repository surfaces and identifies the files connected to an objective.'},
    {name:'File Analyzer',category:'analysis',route:'file.inspect',description:'Inspects source structure and retrieves file-level context.'},
    {name:'Code Analyzer',category:'quality',route:'code.analyze',description:'Evaluates implementation shape and highlights engineering risks.'},
    {name:'Dependency Auditor',category:'security',route:'deps.audit',description:'Reviews dependency posture and flags potential supply-chain concerns.'},
    {name:'Test Runner',category:'validation',route:'test.run',description:'Runs deterministic validation against acceptance criteria.'},
    {name:'Runtime Probe',category:'runtime',route:'runtime.probe',description:'Checks service readiness and operational health.'},
    {name:'Research Gateway',category:'research',route:'research.query',description:'Provides an abstraction for research and evidence gathering.'},
    {name:'Artifact Generator',category:'delivery',route:'artifact.generate',description:'Packages outputs and creates delivery-oriented artifacts.'}
  ];
  const list=tools.length?tools:defaults;
  const categories=['All','Web & APIs','Data','Development','Productivity','System'];
  const visible=list.filter(tool=>{
    const matchesCategory=category==='All'||toolGroup(tool)===category;
    const value=[tool.name,tool.description,tool.route,tool.category].filter(Boolean).join(' ').toLowerCase();
    return matchesCategory&&(!query.trim()||value.includes(query.trim().toLowerCase()));
  });
  const visuals=[CYRUS_IMAGES.spotlight,CYRUS_IMAGES.code,CYRUS_IMAGES.circuit,CYRUS_IMAGES.servers];
  return <div className="section-page page-tools">
    <PageHero eyebrow="TOOLS / RUNTIME INTEGRATIONS" title="Tools" accent="" description="Powerful runtime capabilities. Explore the routes CYRUS uses to inspect, orchestrate, validate and deliver engineering work." image={CYRUS_IMAGES.tools} alt="Illuminated futuristic computing infrastructure" meta={list.length+' REGISTERED CAPABILITIES'} imageCaption="TOOL INTEGRATION ARCHITECTURE"/>
    <section className="tool-console">
      <div className="tool-console-toolbar">
        <div className="tool-tabs" aria-label="Filter tools by category">{categories.map(item=><button key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>
        <label className="tool-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search tools" placeholder="Search tools…"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear tool search">×</button>}</label>
      </div>
      <div className="tools-reference-layout">
        <div className="tool-library reference-tool-library">
          {visible.map((tool,i)=><article className="tool-library-card" key={tool.name}>
            <div className="tool-library-art"><img src={visuals[i%visuals.length]} alt="" loading="lazy"/><span>{String(i+1).padStart(2,'0')}</span><b>ROUTE</b></div>
            <div className="tool-library-body"><div className="tool-card-category">{toolGroup(tool).toUpperCase()}</div><h3>{tool.name}</h3><p>{tool.description}</p><div className="tool-route"><span>ENDPOINT</span><code>{tool.route||'Runtime capability'}</code></div></div>
          </article>)}
          {!visible.length&&<div className="memory-empty tools-empty"><div><span className="editorial-kicker">NO MATCHES</span><h3>No tools found.</h3><p>Try another keyword or select a different category.</p><button onClick={()=>{setCategory('All');setQuery('')}}>Reset filters ↺</button></div></div>}
        </div>
        <aside className="tool-architecture-panel">
          <div className="architecture-panel-head"><span>CYRUS / TOOLING LAYER</span><b>LIVE MAP</b></div>
          <h3>Tool Integration<br/><em>Architecture</em></h3>
          <div className="architecture-stack" aria-hidden="true"><div>◇</div><div>◇</div><div>◇</div><span>CAPABILITY BUS</span></div>
          <div className="architecture-pipeline">
            <div><span>◆</span><b>CYRUS Agent</b><small>Intent / plan</small></div>
            <i/>
            <div><span>⌘</span><b>Tool Runtime</b><small>Execute / observe</small></div>
            <i/>
            <div><span>▧</span><b>Capability Adapter</b><small>Route / response</small></div>
          </div>
          <footer>Secure · Observable · Reliable</footer>
        </aside>
      </div>
    </section>
    <section className="page-spotlight tool-spotlight">
      <img src={CYRUS_IMAGES.spotlight} alt="Abstract digital network infrastructure" loading="lazy"/>
      <div><span className="editorial-kicker">DESIGNED AS A SYSTEM</span><h2>Tools are not decoration.<br/><em>They move work forward.</em></h2><p>Each capability is shown with its runtime route; the browser demo preserves the same workflow when the Flask API is unavailable.</p><div className="spotlight-pills"><span>Explicit routes</span><span>Visible state</span><span>Observable output</span></div></div>
    </section>
  </div>
}

function MemoryView({tasks,open,go}){
  const [query,setQuery]=useState('');
  const completed=tasks.filter(t=>String(t.status||'').toUpperCase()==='COMPLETED').length;
  const awaiting=tasks.filter(t=>String(t.status||'').toUpperCase()==='AWAITING_APPROVAL').length;
  const mean=tasks.length?Math.round(tasks.reduce((sum,t)=>sum+Number(t.score||0),0)/tasks.length):0;
  const needle=query.trim().toLowerCase();
  const filtered=tasks.filter(t=>!needle||[t.task_id,t.objective,t.status,t.mode,t.current_agent].filter(Boolean).join(' ').toLowerCase().includes(needle));
  const photos=[CYRUS_IMAGES.automation,CYRUS_IMAGES.circuit,CYRUS_IMAGES.servers,CYRUS_IMAGES.research,CYRUS_IMAGES.code];
  return <div className="section-page page-memory">
    <PageHero eyebrow="MEMORY / EXECUTION ARCHIVE" title="Memory" accent="" description="Your execution history, preserved and searchable. Explore past objectives, outcomes, run artifacts and confidence signals." image={CYRUS_IMAGES.memory} alt="Code and illuminated computing displays" meta={tasks.length+' STORED RUNS'} imageCaption="THE EXECUTION ARCHIVE"/>
    <div className="page-stat-rail">
      <div className="page-stat"><span>TOTAL RUNS</span><strong>{String(tasks.length).padStart(2,'0')}</strong><small>Execution records</small></div>
      <div className="page-stat"><span>SUCCESSFUL</span><strong>{String(completed).padStart(2,'0')}</strong><small>Completed workflows</small></div>
      <div className="page-stat"><span>AWAITING APPROVAL</span><strong>{String(awaiting).padStart(2,'0')}</strong><small>Human release gate</small></div>
      <div className="page-stat"><span>MEAN SCORE</span><strong>{tasks.length?mean:'—'}</strong><small>Across available runs</small></div>
    </div>
    <section className="page-section memory-collection">
      <div className="section-heading memory-heading"><div><span className="editorial-kicker">PERSISTENT RUN LIBRARY</span><h2>Your memory, <em>at a glance.</em></h2></div><label className="memory-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search execution memory" placeholder="Search by objective, task ID, or agent…"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear memory search">×</button>}</label></div>
      {filtered.length?<div className="memory-gallery">{filtered.map((t,i)=><button className="memory-gallery-card" key={t.task_id} onClick={()=>open(t)}>
        <div className="memory-gallery-media"><img src={photos[i%photos.length]} alt="" loading="lazy"/><span className="memory-score">{Number(t.score||0).toFixed(1)} <small>SCORE</small></span><span className={'memory-status '+String(t.status||'UNKNOWN').toLowerCase().replace(/[^a-z_]/g,'-')}><i/>{String(t.status||'UNKNOWN').replaceAll('_',' ')}</span></div>
        <div className="memory-gallery-content"><div className="memory-record-time">{t.created_at?new Date(t.created_at).toLocaleString():'DATE UNAVAILABLE'} · {String(t.mode||'autonomous').toUpperCase()}</div><h3>{t.objective||'Untitled execution'}</h3><p>{t.current_agent?'Last agent · '+t.current_agent:'Execution record available for inspection'}</p><div className="memory-gallery-foot"><span>{t.task_id}</span><b>OPEN RECORD ↗</b></div></div>
      </button>)}</div>:<div className="memory-empty"><img src={CYRUS_IMAGES.memory} alt="Code on a monitor in an engineering workspace" loading="lazy"/><div><span className="editorial-kicker">{tasks.length?'SEARCH COMPLETE':'YOUR ARCHIVE STARTS HERE'}</span><h3>{tasks.length?'No matching memory records.':'No execution memory yet.'}</h3><p>{tasks.length?'Adjust your search terms to locate a previous run.':'Run your first engineering objective. CYRUS will create a record here so the outcome can be revisited and investigated.'}</p><button onClick={()=>tasks.length?setQuery(''):go('Command')}>{tasks.length?'Clear search':'Open command surface'} <b>↗</b></button></div></div>}
    </section>
    <section className="memory-retention-note"><span>MEMORY / TRACE / OUTCOME</span><p>Keep decisions connected to evidence. Open any recorded objective to inspect its status, trace, and release artifacts.</p><button onClick={()=>go('History')}>Explore execution history <b>↗</b></button></section>
  </div>
}

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
    <PageHero eyebrow="HISTORY / EXECUTION LEDGER" title="Execution" accent=" History" description="Search, filter and explore your past executions. Inspect run status, quality signals, duration and the full execution record." image={CYRUS_IMAGES.history} alt="Abstract cybersecurity visualization on a dark screen" meta={tasks.length+' TOTAL RUNS'} imageCaption="THE RUN LEDGER"/>
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

