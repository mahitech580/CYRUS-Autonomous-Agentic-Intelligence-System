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
  const handlePointerMove=event=>{
    const rect=event.currentTarget.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const x=(event.clientX-rect.left)/rect.width;
    const y=(event.clientY-rect.top)/rect.height;
    event.currentTarget.style.setProperty('--doom-tilt-x',((.5-y)*8).toFixed(2)+'deg');
    event.currentTarget.style.setProperty('--doom-tilt-z',((x-.5)*5).toFixed(2)+'deg');
  };
  const resetPointer=event=>{
    event.currentTarget.style.setProperty('--doom-tilt-x','0deg');
    event.currentTarget.style.setProperty('--doom-tilt-z','0deg');
  };
  return <div className="cyrus-hero-visual doom-scene" onPointerMove={handlePointerMove} onPointerLeave={resetPointer}>
    <div className="doom-atmosphere" aria-hidden="true"><i/><i/><i/><span className="doom-rune-ring"/></div>
    <div className="doom-smoke" aria-hidden="true">
      <span className="doom-smoke-puff puff-a"/><span className="doom-smoke-puff puff-b"/><span className="doom-smoke-puff puff-c"/>
      <span className="doom-smoke-puff puff-d"/><span className="doom-smoke-puff puff-e"/><span className="doom-smoke-puff puff-f"/>
      <span className="doom-smoke-puff puff-g"/><span className="doom-ground-fog"/>
    </div>
    <div className="doom-character-label"><i/><span>VICTOR VON DOOM</span><b>LATVERIA / PRIME</b></div>
    <div className="doom-rotation">
      <div className="doom-spinner">
        <div className="doom-float-wrap">
          <svg className="cyrus-portrait doom-face doom-front" viewBox="0 0 700 900" role="img" aria-labelledby="doom-title doom-desc">
            <title id="doom-title">Doctor Doom, Marvel's armored ruler of Latveria</title>
            <desc id="doom-desc">Fan-inspired vector depiction of Doctor Doom wearing a deep green hood and cloak, silver riveted metal mask, dark green armor and a glowing emerald core.</desc>
            <defs>
              <linearGradient id="doom-cloak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#365d35"/><stop offset=".22" stopColor="#17391e"/><stop offset=".57" stopColor="#071a0b"/><stop offset="1" stopColor="#020803"/></linearGradient>
              <linearGradient id="doom-cloak-lit" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stopColor="#568345"/><stop offset=".32" stopColor="#1b4921"/><stop offset="1" stopColor="#041007"/></linearGradient>
              <linearGradient id="doom-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eff3db"/><stop offset=".17" stopColor="#8d9a87"/><stop offset=".36" stopColor="#e0e7d4"/><stop offset=".63" stopColor="#69786d"/><stop offset=".82" stopColor="#c5d0bd"/><stop offset="1" stopColor="#394a40"/></linearGradient>
              <linearGradient id="doom-steel-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#aab9a8"/><stop offset=".5" stopColor="#34473b"/><stop offset="1" stopColor="#101b13"/></linearGradient>
              <linearGradient id="doom-armor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#27412b"/><stop offset=".3" stopColor="#14281a"/><stop offset=".68" stopColor="#07150b"/><stop offset="1" stopColor="#010602"/></linearGradient>
              <linearGradient id="doom-green" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9ff75"/><stop offset=".5" stopColor="#4aff3f"/><stop offset="1" stopColor="#0c9d25"/></linearGradient>
              <radialGradient id="doom-aura"><stop offset="0" stopColor="#54ff3b" stopOpacity=".34"/><stop offset=".5" stopColor="#1bcb31" stopOpacity=".13"/><stop offset="1" stopColor="#031004" stopOpacity="0"/></radialGradient>
              <filter id="doom-green-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="doom-metal-shadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="6"/><feOffset dy="9"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <pattern id="doom-weave" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 18L18 0M-5 5L5-5M13 23L23 13" stroke="#81b45c" strokeOpacity=".12" strokeWidth="1"/></pattern>
            </defs>
            <ellipse cx="360" cy="420" rx="280" ry="420" fill="url(#doom-aura)"/>
            <g className="doom-cape">
              <path d="M257 348Q190 365 139 440L87 598Q62 738 28 900H676Q640 757 611 599L559 437Q513 372 447 350L387 391Z" fill="#030904" stroke="#213c20" strokeWidth="4"/>
              <path d="M278 357L184 408 126 570 75 872 177 900 289 621Z" fill="url(#doom-cloak-lit)" stroke="#496e39" strokeWidth="3"/>
              <path d="M426 357L520 408 577 570 630 872 528 900 416 621Z" fill="url(#doom-cloak)" stroke="#36562c" strokeWidth="3"/>
              <path d="M183 414L235 397 204 640 150 886 111 895 158 616Z" fill="#5d8d3d" opacity=".32"/>
              <path d="M520 414L465 395 496 640 550 886 590 895 542 616Z" fill="#8bb94c" opacity=".17"/>
              <path d="M276 368Q235 519 251 664L216 900H489L455 664Q471 519 429 368Z" fill="#08180b" stroke="#304d25" strokeWidth="3"/>
              <path d="M275 379L242 492 256 706 220 900H282L314 613 315 444Z" fill="url(#doom-weave)" opacity=".8"/>
              <path d="M429 379L462 492 448 706 484 900H422L390 613 389 444Z" fill="url(#doom-weave)" opacity=".8"/>
              <path d="M226 430L273 387 300 451 268 553 218 620 188 585Z" fill="#1d3f21" stroke="#557a3d" strokeWidth="2"/>
              <path d="M478 430L431 387 404 451 436 553 486 620 516 585Z" fill="#0e2914" stroke="#456c32" strokeWidth="2"/>
            </g>
            <g className="doom-shoulder-armor">
              <path d="M267 395L215 398 166 455 145 538 211 579 288 524 323 449Z" fill="url(#doom-armor)" stroke="#607c49" strokeWidth="4"/>
              <path d="M433 395L485 398 534 455 555 538 489 579 412 524 377 449Z" fill="url(#doom-armor)" stroke="#536e41" strokeWidth="4"/>
              <path d="M177 470L224 426 261 440 222 500 166 527Z" fill="#5c8341" opacity=".62"/>
              <path d="M523 470L476 426 439 440 478 500 534 527Z" fill="#385d2c" opacity=".7"/>
              <path d="M172 533L213 548 232 530M528 533L487 548 468 530" fill="none" stroke="#9aae83" strokeOpacity=".5" strokeWidth="4"/>
              <circle cx="200" cy="469" r="7" fill="url(#doom-steel)" stroke="#101c12" strokeWidth="3"/>
              <circle cx="500" cy="469" r="7" fill="url(#doom-steel)" stroke="#101c12" strokeWidth="3"/>
            </g>
            <g className="doom-hood">
              <path d="M239 184Q246 74 348 46Q456 38 493 133L508 282 485 374 435 414 265 410 219 348 213 273Z" fill="url(#doom-cloak)" stroke="#66894d" strokeWidth="4"/>
              <path d="M229 259Q220 142 294 84L345 55 322 117 357 79 373 57 376 111 421 69 415 130 460 112 479 177 490 278 466 248 439 211 390 201 341 220 302 249 276 309Z" fill="#0a170b" stroke="#314e2b" strokeWidth="3"/>
              <path d="M238 221Q256 111 327 76L306 131 341 101 331 154 366 102 365 158 414 96 407 163 445 137 464 206 475 281 447 244 425 220 383 232 333 246 293 278 274 330Z" fill="#18361b"/>
              <path d="M248 244Q266 154 321 119L307 183 338 141 343 199 374 146 382 198 423 154 413 210 452 193 464 251 447 300 432 256 393 244 348 259 303 290 281 333Z" fill="#040c05"/>
              <path d="M253 210Q220 274 240 333L270 384 302 408 292 358 276 290 292 235Z" fill="#080f08" stroke="#37552d" strokeWidth="3"/>
              <path d="M468 210Q500 274 480 333L450 384 418 408 428 358 444 290 428 235Z" fill="#030803" stroke="#2b4823" strokeWidth="3"/>
            </g>
            <g className="doom-neck">
              <path d="M300 347L293 418 326 456 371 469 418 451 447 413 437 343Z" fill="url(#doom-steel-dark)" stroke="#334a39" strokeWidth="3"/>
              <path d="M315 376L335 428 369 445 405 427 427 376" fill="none" stroke="#91a68a" strokeOpacity=".6" strokeWidth="4"/>
            </g>
            <g className="doom-mask" filter="url(#doom-metal-shadow)">
              <path d="M276 187Q291 145 348 139L402 145Q456 153 464 196L451 284 419 340 372 368 326 340 290 286Z" fill="url(#doom-steel)" stroke="#d3dfc8" strokeWidth="3"/>
              <path d="M276 193L307 205 307 282 326 327 348 349 327 340 290 286Z" fill="#526554" opacity=".72"/>
              <path d="M463 194L436 205 438 282 418 327 396 349 419 340 451 284Z" fill="#37483c" opacity=".77"/>
              <path d="M293 207L335 190 350 212 333 230 301 231Z" fill="#19291e" stroke="#617767" strokeWidth="3"/>
              <path d="M411 190L451 207 443 231 411 230 394 212Z" fill="#17281d" stroke="#617767" strokeWidth="3"/>
              <path d="M298 214L333 204 342 215 330 221 300 224Z" fill="url(#doom-green)" filter="url(#doom-green-glow)"/>
              <path d="M403 215L412 204 446 214 444 224 414 221Z" fill="url(#doom-green)" filter="url(#doom-green-glow)"/>
              <path d="M370 208L351 253 365 273 378 266" fill="none" stroke="#4a5e4d" strokeWidth="7" strokeLinecap="round"/>
              <path d="M370 220L362 252 372 261" fill="none" stroke="#eef8e0" strokeOpacity=".6" strokeWidth="2"/>
              <path d="M332 274L369 290 408 274 397 319 370 337 343 319Z" fill="#344639" stroke="#19281c" strokeWidth="3"/>
              <path d="M343 287L355 291M359 294L371 298M378 295L390 290M349 307L361 311M372 311L385 307" stroke="#c8d4c3" strokeWidth="3" strokeLinecap="round"/>
              <path d="M329 321L369 341 411 321" fill="none" stroke="#26382b" strokeWidth="5"/>
              <path d="M291 246L312 263 320 293M448 246L429 263 421 293" fill="none" stroke="#e5f1dd" strokeOpacity=".6" strokeWidth="2"/>
              <g fill="#17271b" stroke="#d4e1cf" strokeWidth="2">
                <circle cx="291" cy="214" r="5"/><circle cx="447" cy="214" r="5"/><circle cx="300" cy="277" r="5"/><circle cx="438" cy="277" r="5"/><circle cx="316" cy="316" r="4"/><circle cx="423" cy="316" r="4"/>
              </g>
              <path d="M319 173L337 158 370 153 405 161 423 178" fill="none" stroke="#f4f8ec" strokeOpacity=".65" strokeWidth="3"/>
            </g>
            <g className="doom-armor-chest">
              <path d="M279 413L315 388 370 409 425 388 460 413 438 546 406 594 370 620 333 594 300 546Z" fill="url(#doom-armor)" stroke="#4b6b3a" strokeWidth="4"/>
              <path d="M315 410L341 424 332 535 308 559 294 529Z" fill="url(#doom-steel-dark)" stroke="#60795b" strokeWidth="3"/>
              <path d="M425 410L399 424 408 535 432 559 446 529Z" fill="url(#doom-steel-dark)" stroke="#60795b" strokeWidth="3"/>
              <path d="M341 426L370 441 399 426 406 521 370 559 334 521Z" fill="#08150a" stroke="#547342" strokeWidth="3"/>
              <path d="M342 450L370 435 398 450 389 484 370 500 351 484Z" fill="#0e2412" stroke="#5ce53e" strokeWidth="3"/>
              <path d="M356 457L370 449 384 457 380 473 370 481 360 473Z" fill="url(#doom-green)" filter="url(#doom-green-glow)"/>
              <path d="M370 501L370 545M340 518L356 537M400 518L384 537" stroke="#4aff3f" strokeOpacity=".6" strokeWidth="3"/>
              <path d="M321 562L370 579 419 562 405 594 370 620 335 594Z" fill="#020904" stroke="#274b25" strokeWidth="3"/>
              <path d="M320 431L309 477 321 510M420 431L431 477 419 510" stroke="#6b8e59" strokeOpacity=".6" strokeWidth="3" fill="none"/>
            </g>
            <g className="doom-gauntlets">
              <path d="M205 581L245 558 284 582 296 637 270 685 221 663 196 623Z" fill="url(#doom-steel-dark)" stroke="#577249" strokeWidth="4"/>
              <path d="M494 581L454 558 415 582 403 637 429 685 478 663 503 623Z" fill="url(#doom-steel-dark)" stroke="#577249" strokeWidth="4"/>
              <path d="M220 601L259 582 279 605 267 641 238 650 214 626Z" fill="#142a17" stroke="#9daf91" strokeWidth="2"/>
              <path d="M479 601L440 582 420 605 432 641 461 650 485 626Z" fill="#0b200f" stroke="#8da681" strokeWidth="2"/>
              <path d="M223 674L253 687 283 666 303 712 286 780 245 803 207 764Z" fill="url(#doom-cloak)" stroke="#29492a" strokeWidth="3"/>
              <path d="M477 674L447 687 417 666 397 712 414 780 455 803 493 764Z" fill="url(#doom-cloak)" stroke="#29492a" strokeWidth="3"/>
            </g>
            <g className="doom-runes" fill="none" stroke="#62ff45" strokeWidth="2.5" filter="url(#doom-green-glow)" opacity=".9">
              <path d="M251 485L270 506 261 529 280 546M489 485L470 506 479 529 460 546"/>
              <path d="M312 611L333 632 333 657M428 611L407 632 407 657"/>
              <path d="M347 660L370 682 393 660"/>
            </g>
            <text x="370" y="846" textAnchor="middle" fill="#90ff6a" fontSize="14" fontFamily="monospace" letterSpacing="7">DOOM / LATVERIA</text>
          </svg>
          <svg className="cyrus-portrait doom-face doom-back" viewBox="0 0 700 900" aria-hidden="true">
            <defs>
              <linearGradient id="doom-back-cloak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#355d2b"/><stop offset=".35" stopColor="#143819"/><stop offset="1" stopColor="#020803"/></linearGradient>
              <linearGradient id="doom-back-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b5c2a6"/><stop offset=".5" stopColor="#293a2e"/><stop offset="1" stopColor="#080f09"/></linearGradient><radialGradient id="doom-back-aura"><stop offset="0" stopColor="#54ff3b" stopOpacity=".3"/><stop offset="1" stopColor="#031004" stopOpacity="0"/></radialGradient>
            </defs>
            <ellipse cx="350" cy="425" rx="285" ry="400" fill="url(#doom-back-aura)"/>
            <path d="M270 900L250 596Q218 464 233 278Q239 88 351 45Q466 70 475 278Q490 464 457 596L433 900Z" fill="url(#doom-back-cloak)" stroke="#638b43" strokeWidth="5"/>
            <path d="M250 273Q250 104 350 68Q451 104 452 273L430 419 394 484 306 484 270 419Z" fill="#071308" stroke="#4e7535" strokeWidth="4"/>
            <path d="M268 284Q270 136 350 103Q430 136 432 284L409 405 376 453 324 453 291 405Z" fill="#1d421d" stroke="#78975a" strokeWidth="3"/>
            <path d="M286 270L312 177 341 143 329 231 349 176 365 232 384 143 398 241 417 192 418 289 398 371 373 407 329 407 305 371Z" fill="#0a170a"/>
            <path d="M239 505L300 460 350 498 401 460 462 505 510 705 478 900H223L190 705Z" fill="#07120a" stroke="#3f602b" strokeWidth="4"/>
            <path d="M290 470L350 504 410 470 448 660 408 900H292L252 660Z" fill="url(#doom-back-steel)" stroke="#546b49" strokeWidth="3"/>
            <path d="M350 512L350 850" stroke="#80ff50" strokeOpacity=".7" strokeWidth="3"/>
            <path d="M264 568L315 604 315 704 275 820M436 568L385 604 385 704 425 820" stroke="#73e64d" strokeOpacity=".65" strokeWidth="4" fill="none"/>
            <path d="M249 546L294 531 326 562 315 617 274 633 240 594ZM451 546L406 531 374 562 385 617 426 633 460 594Z" fill="#0a1c0d" stroke="#77935d" strokeWidth="3"/>
            <path d="M310 624L350 646 390 624 380 695 350 716 320 695Z" fill="#08120a" stroke="#5be13f" strokeWidth="3"/>
            <path d="M350 654L366 673 350 691 334 673Z" fill="url(#doom-green)" filter="url(#doom-green-glow)"/>
            <text x="350" y="846" textAnchor="middle" fill="#90ff6a" fontSize="14" fontFamily="monospace" letterSpacing="7">DOOM / LATVERIA</text>
          </svg>
        </div>
      </div>
    </div>
    <div className="doom-hud doom-hud-left"><span>ARMOR STATUS</span><b><i/> ACTIVE</b><small>Vibranium-steel alloy</small></div>
    <div className="doom-hud doom-hud-right"><span>CORE REACTOR</span><b>{busy?'OVERDRIVE':'STABLE'}</b><small>{currentAgents.length||7} agents · {runtimeState}</small></div>
    <div className="cyrus-nameplate doom-nameplate"><small>RULER OF LATVERIA</small><strong>DOCTOR DOOM</strong><em>VICTOR VON DOOM / CYRUS EDITION</em></div>
    <div className="cyrus-scroll-cue"><span>ENTER THE GREEN KINGDOM</span><i/></div>
  </div>
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

