const {useEffect,useMemo,useRef,useState}=React

const API_TIMEOUT_MS=70000
const NAV_ITEMS=['Home','Platform','Command','Agents','Memory','Tools','History']

function apiUrl(path){
  const base=String(window.CYRUS_CONFIG?.apiBaseUrl||'').trim().replace(/\/+$/,'')
  const route=String(path||'')
  return base?base+(route.startsWith('/')?route:'/'+route):route
}

async function apiJson(path,options={}){
  const method=(options.method||'GET').toUpperCase()
  const attempts=method==='GET'?2:1
  let lastError
  let retryDelayMs=180
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),API_TIMEOUT_MS)
    try{
      const headers={...(options.headers||{})}
      const accessKey=String(window.CYRUS_CONFIG?.apiAccessKey||'').trim()
      if(accessKey)headers['X-CYRUS-Access-Key']=accessKey
      const res=await fetch(apiUrl(path),{...options,headers,signal:controller.signal})
      const retryAfter=Number(res.headers.get('Retry-After'))
      retryDelayMs=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,3000):180
      const data=await res.json().catch(()=>({}))
      if(!res.ok)throw new Error(res.status===401?'API access key required or invalid. Open API ↗ settings and enter the key configured on Render.':(data.error||'CYRUS request failed'))
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

function ApiSettingsModal({close}){
  const defaultUrl=String(window.CYRUS_CONFIG?.defaultApiBaseUrl||'https://cyrus-agentic-api-mahitech580.onrender.com');
  const currentUrl=String(window.CYRUS_CONFIG?.apiBaseUrl||defaultUrl);
  const [value,setValue]=useState(currentUrl);
  const [accessKey,setAccessKey]=useState(String(window.CYRUS_CONFIG?.apiAccessKey||''));
  const [error,setError]=useState('');
  const save=event=>{
    event.preventDefault();
    const candidate=value.trim().replace(/\/+$/,'');
    if(!candidate){setError('Enter your live backend URL.');return;}
    let parsed;
    try{parsed=new URL(candidate)}catch{setError('Enter a full URL, such as https://your-service.onrender.com');return;}
    if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password){setError('Use a valid HTTP(S) URL without credentials.');return;}
    try{
      localStorage.setItem('cyrus-api-base-url',parsed.origin+parsed.pathname.replace(/\/+$/,''));
      const candidateKey=accessKey.trim();
      if(candidateKey)sessionStorage.setItem('cyrus-api-access-key',candidateKey);
      else sessionStorage.removeItem('cyrus-api-access-key');
      window.location.reload();
    }catch{setError('Browser storage is blocked; allow local storage and retry.');}
  };
  const reset=()=>{
    try{localStorage.removeItem('cyrus-api-base-url');sessionStorage.removeItem('cyrus-api-access-key');window.location.reload();}
    catch{setError('Browser storage is blocked; unable to reset the URL.');}
  };
  return <div className="api-settings-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close()}}>
    <section className="api-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
      <div className="api-settings-head"><div><span>CYRUS / CONNECTION SETTINGS</span><h2 id="api-settings-title">Connect the live backend.</h2></div><button type="button" onClick={close} aria-label="Close API settings">×</button></div>
      <p>The GitHub Pages frontend needs a running Flask API URL. Save your deployed Render address so execution, metrics, history and live event streams reach the server instead of browser-demo data.</p>
      <form onSubmit={save}>
        <label htmlFor="cyrus-api-url">Backend base URL</label>
        <input id="cyrus-api-url" type="url" autoComplete="url" spellCheck="false" value={value} onChange={event=>{setValue(event.target.value);setError('')}} placeholder="https://your-service.onrender.com" required/>
        <label htmlFor="cyrus-api-key">API access key (only if configured on Render)</label>
        <input id="cyrus-api-key" type="password" autoComplete="current-password" spellCheck="false" value={accessKey} onChange={event=>{setAccessKey(event.target.value);setError('')}} placeholder="Leave blank when access-key protection is disabled"/>
        <p className="api-settings-key-note">The key is kept in this browser tab's session storage and sent only with API requests. Do not paste your model-provider key here.</p>
        {error&&<div className="api-settings-error" role="alert">{error}</div>}
        <div className="api-settings-example"><span>EXPECTED ENDPOINT</span><code>{value.trim().replace(/\/+$/,'')||'https://your-service.onrender.com'}/api/health</code></div>
        <div className="api-settings-actions"><button type="button" className="api-settings-reset" onClick={reset}>Reset default URL</button><button className="api-settings-save" type="submit">Save & reconnect ↗</button></div>
      </form>
      <div className="api-settings-note"><i/> Render Free may sleep after inactivity; the first request can take about a minute to wake the server.</div>
      <a className="api-settings-deploy-link" href="https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fmahitech580%2FCYRUS-Autonomous-Agentic-Intelligence-System" target="_blank" rel="noreferrer">Deploy the Flask backend on Render ↗</a>
    </section>
  </div>
}

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
  const [apiSettingsOpen,setApiSettingsOpen]=useState(false)

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
    {page==='Home'&&<HomeView go={go} runtimeState={runtimeState} busy={busy} agents={agents} openPalette={()=>setPaletteOpen(true)} openApiSettings={()=>setApiSettingsOpen(true)}/>}
    {page!=='Home'&&<>
      <aside className="sidebar workspace-sidebar">
        <button className="brand" onClick={()=>go('Home')} aria-label="Open CYRUS home">
          <span className="brand-mark"><span/></span>
          <span><strong>CYRUS</strong><small>AUTONOMOUS INTELLIGENCE</small></span>
        </button>
        <nav className="nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item,i)=><button key={item} className={page===item?'active':''} onClick={()=>go(item)}>
            <span className="nav-icon" aria-hidden="true">{({'Home':'⌂','Platform':'▦','Command':'⌘','Agents':'♙','Memory':'◫','Tools':'⌘','History':'◷'})[item]}</span>
            <span className="label">{item}</span><span className="num">{String(i+1).padStart(2,'0')}</span>
          </button>)}
        </nav>
        <div className="side-foot"><span className="dot"/><div><strong>System Online</strong><small>All systems operational</small></div></div>
      </aside>
      <main className="main workspace-main">
        <div className="topbar">
          <div className="eyebrow">CYRUS / {page.toUpperCase()} WORKSPACE</div>
          <div className="top-actions">
            <button className="backend-settings-button" type="button" onClick={()=>setApiSettingsOpen(true)} title="Configure the live API backend">API ↗</button>
            <button className={'motion-toggle '+(motionEnabled?'active':'')} type="button" aria-pressed={motionEnabled} onClick={toggleMotion} title="Toggle motion effects"><span className="motion-toggle-icon" aria-hidden="true">{motionEnabled?'◉':'◌'}</span><span>{motionEnabled?'MOTION ON':'CALM MODE'}</span></button>
            <div className="live-pill"><span className="dot"/>{runtimeState} · {busy?'RUNNING':'READY'}</div>
            <button className="nav-command" onClick={()=>setPaletteOpen(true)}>⌘ K</button>
          </div>
        </div>
        {page==='Platform'&&<PlatformView go={go} notify={notify} open={openTask}/>}
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
    {apiSettingsOpen&&<ApiSettingsModal close={()=>setApiSettingsOpen(false)}/>}
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
  const sceneRef=useRef(null);
  const controlsRef=useRef({rotationOn:true,smokeOn:true,embersOn:true,cinematic:false});
  const [rotationOn,setRotationOn]=useState(true);
  const [smokeOn,setSmokeOn]=useState(true);
  const [embersOn,setEmbersOn]=useState(true);
  const [cinematic,setCinematic]=useState(false);
  controlsRef.current={rotationOn,smokeOn,embersOn,cinematic};
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
  const resetSceneView=event=>{
    const root=event.currentTarget.closest('.doom-scene');
    root?.style.setProperty('--doom-tilt-x','0deg');
    root?.style.setProperty('--doom-tilt-z','0deg');
  };
  useEffect(()=>{
    const host=sceneRef.current;
    const T=window.THREE;
    if(!host||!T)return;
    let renderer,raf=0,resizeObserver=null;
    const resources=[];
    const disposables=[];
    try{
      const scene=new T.Scene();
      scene.fog=new T.FogExp2(0x041004,.035);
      const camera=new T.PerspectiveCamera(35,1,.1,80);
      camera.position.set(4.9,3.3,8.8);
      camera.lookAt(0,1.85,0);
      const compactDevice=window.matchMedia('(max-width: 760px)').matches;
      renderer=new T.WebGLRenderer({alpha:true,antialias:!compactDevice,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,compactDevice?1.05:1.5));
      renderer.setClearColor(0x000000,0);
      renderer.domElement.setAttribute('aria-hidden','true');
      renderer.domElement.className='doom-webgl-canvas';
      host.appendChild(renderer.domElement);
      host.closest('.doom-scene')?.classList.add('webgl-ready');
      const ambient=new T.HemisphereLight(0x8cdb77,0x031004,1.5);scene.add(ambient);
      const keyLight=new T.DirectionalLight(0xe3ffcf,2.8);keyLight.position.set(-3.8,6,5);scene.add(keyLight);
      const rimLight=new T.PointLight(0x45ff1e,4.5,12);rimLight.position.set(3.8,3.2,-2.4);scene.add(rimLight);
      const edgeLight=new T.PointLight(0x7fff47,2.1,9);edgeLight.position.set(-3,1.8,-1.4);scene.add(edgeLight);
      const coreLight=new T.PointLight(0x48ff26,1.9,3.5);coreLight.position.set(0,1.55,.8);scene.add(coreLight);

      const tiltRig=new T.Group();scene.add(tiltRig);
      const spinRig=new T.Group();tiltRig.add(spinRig);
      const floatRig=new T.Group();spinRig.add(floatRig);
      const material=(color,metalness=0,roughness=.6,emissive=0,emissiveIntensity=0)=>{
        const m=new T.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity});
        resources.push(m);return m;
      };
      const cloakMat=material(0x143a12,.1,.72);
      const cloakLit=material(0x285d1e,.12,.6);
      const cloakDark=material(0x061507,.05,.82);
      const armorMat=material(0x172b16,.5,.38);
      const armorEdge=material(0x42653a,.62,.42);
      const steel=material(0x9faa9a,.92,.27);
      const steelLight=material(0xd5decb,.88,.24);
      const steelDark=material(0x48584a,.88,.34);
      const black=material(0x060d07,.15,.75);
      const greenGlow=material(0x43ff24,.3,.22,0x2fff14,2.6);
      const greenDim=material(0x247a18,.5,.35,0x1cc510,.65);
      const addMesh=(geometry,mat,x,y,z,parent=floatRig)=>{
        const mesh=new T.Mesh(geometry,mat);mesh.position.set(x,y,z);parent.add(mesh);
        resources.push(geometry);return mesh;
      };
      const box=(w,h,d,mat,x,y,z,parent=floatRig)=>{
        return addMesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
      };
      const sphere=(rx,ry,rz,mat,x,y,z,parent=floatRig)=>{
        const geo=new T.SphereGeometry(1,24,18);geo.scale(rx,ry,rz);
        return addMesh(geo,mat,x,y,z,parent);
      };
      const line=(points,mat,r=.014,parent=floatRig)=>{
        const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1],p[2])));
        return addMesh(new T.TubeGeometry(curve,28,r,7,false),mat,0,0,0,parent);
      };

      // One-piece hooded cloak, sculpted in 3D and layered behind the armor.
      const capeShape=new T.Shape();
      capeShape.moveTo(-.47,2.33);
      capeShape.bezierCurveTo(-1.06,2.3,-1.05,1.35,-1.36,.08);
      capeShape.quadraticCurveTo(0,-.18,1.36,.08);
      capeShape.bezierCurveTo(1.05,1.35,1.06,2.3,.47,2.33);
      capeShape.lineTo(.28,1.96);capeShape.lineTo(-.28,1.96);capeShape.closePath();
      const capeGeo=new T.ExtrudeGeometry(capeShape,{depth:.12,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.05});
      const cape=addMesh(capeGeo,cloakMat,0,0,-.58);
      cape.rotation.y=.015;
      // Heavy cloak folds catch the emerald rim light.
      line([[-.66,2.14,-.43],[-.82,1.54,-.42],[-.89,.77,-.42],[-1.13,.16,-.41]],cloakLit,.025);
      line([[-.36,2.15,-.41],[-.43,1.38,-.4],[-.51,.72,-.4],[-.61,.12,-.4]],cloakDark,.028);
      line([[.66,2.14,-.43],[.82,1.54,-.42],[.89,.77,-.42],[1.13,.16,-.41]],cloakDark,.025);
      line([[.36,2.15,-.41],[.43,1.38,-.4],[.51,.72,-.4],[.61,.12,-.4]],cloakLit,.025);
      // Hood shell and shadow cavity.
      sphere(.69,.83,.48,cloakLit,0,3.02,-.19);
      sphere(.58,.73,.45,cloakDark,0,3.06,-.08);
      const hoodRim=addMesh(new T.TorusGeometry(.55,.075,10,40,Math.PI),cloakLit,0,3.43,.23);
      hoodRim.rotation.z=Math.PI;
      // Neck, torso and layered breastplate.
      const neck=addMesh(new T.CylinderGeometry(.2,.25,.31,12),steelDark,0,2.25,.06);neck.rotation.z=.02;
      box(.92,1.04,.45,armorMat,0,1.58,.03);
      box(.68,.78,.09,steelDark,0,1.59,.285);
      box(.54,.64,.055,armorMat,0,1.6,.34);
      // Angular chest plates with bevelled edges.
      const chestShape=new T.Shape();
      chestShape.moveTo(-.32,.39);chestShape.lineTo(-.45,.23);chestShape.lineTo(-.36,-.25);chestShape.lineTo(0,-.43);chestShape.lineTo(.36,-.25);chestShape.lineTo(.45,.23);chestShape.lineTo(.32,.39);chestShape.lineTo(0,.28);chestShape.closePath();
      const chestGeo=new T.ExtrudeGeometry(chestShape,{depth:.07,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025});
      addMesh(chestGeo,steelDark,0,1.62,.37);
      box(.08,.67,.03,armorEdge,0,1.62,.455);
      box(.74,.075,.04,steel,0,1.9,.44);
      box(.7,.06,.04,steel,0,1.31,.44);
      // The green reactor and its concentric metal rings.
      sphere(.15,.15,.085,greenGlow,0,1.65,.5);
      const reactorRing=addMesh(new T.TorusGeometry(.205,.027,10,36),armorEdge,0,1.65,.48);reactorRing.rotation.x=0;
      const reactorRing2=addMesh(new T.TorusGeometry(.27,.012,8,36),greenDim,0,1.65,.47);
      // Waist belt and sculpted buckle.
      box(.96,.18,.5,steelDark,0,1.03,.07);
      box(.27,.23,.12,steel,0,1.03,.34);
      box(.15,.12,.035,greenGlow,0,1.03,.42);
      // Boots and greaves.
      for(const side of [-1,1]){
        box(.33,.73,.36,armorMat,side*.245,.52,.03);
        box(.36,.25,.49,steelDark,side*.245,.18,.13);
        box(.31,.12,.5,armorEdge,side*.245,.105,.15);
        box(.31,.39,.09,steelDark,side*.245,.56,.25);
        box(.18,.11,.08,steel,side*.245,.65,.31);
        // Shoulder pauldron, upper arm, vambrace and gauntlet.
        sphere(.4,.26,.44,cloakLit,side*.62,2.02,.015);
        const pauldron=sphere(.34,.2,.4,armorMat,side*.65,2.04,.14);pauldron.rotation.z=side*-.12;
        const shoulderTrim=addMesh(new T.TorusGeometry(.31,.025,8,26,Math.PI),steelDark,side*.64,2.05,.2);
        shoulderTrim.rotation.z=side>0?Math.PI:0;
        const upper=addMesh(new T.CylinderGeometry(.17,.22,.52,9),armorMat,side*.69,1.69,.12);upper.rotation.z=side*-.15;
        const forearm=addMesh(new T.CylinderGeometry(.18,.25,.48,8),steelDark,side*.79,1.29,.18);forearm.rotation.z=side*-.1;
        const bracer=box(.39,.22,.35,armorMat,side*.79,1.35,.25);bracer.rotation.z=side*.1;
        box(.32,.07,.37,armorEdge,side*.79,1.43,.27);
        sphere(.16,.17,.16,steelDark,side*.8,1.0,.22);
        for(let n=0;n<3;n++)box(.06,.028,.035,steel,side*.79+(n-1)*.09,1.32,.44);
      }
      // The iconic iron mask: angular metal faceplate, bright eyes, rivets and mouth grille.
      sphere(.48,.57,.39,black,0,2.98,.14);
      sphere(.59,.7,.43,cloakDark,0,3.0,-.02);
      const maskShape=new T.Shape();
      maskShape.moveTo(-.43,.3);
      maskShape.quadraticCurveTo(-.38,.43,-.17,.43);
      maskShape.lineTo(0,.38);maskShape.lineTo(.17,.43);
      maskShape.quadraticCurveTo(.38,.43,.43,.3);
      maskShape.lineTo(.36,-.2);maskShape.lineTo(.15,-.45);
      maskShape.lineTo(0,-.5);maskShape.lineTo(-.15,-.45);
      maskShape.lineTo(-.36,-.2);maskShape.closePath();
      const maskGeo=new T.ExtrudeGeometry(maskShape,{depth:.13,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.025,bevelThickness:.025});
      addMesh(maskGeo,steel,0,2.98,.38);
      // Narrow, angled emerald eye slits.
      const eyeShape=new T.Shape();eyeShape.moveTo(-.2,.11);eyeShape.lineTo(-.035,.145);eyeShape.lineTo(-.075,.08);eyeShape.lineTo(-.2,.055);eyeShape.closePath();
      const eyeGeo=new T.ShapeGeometry(eyeShape);addMesh(eyeGeo,greenGlow,0,3.02,.535);
      const eyeShape2=new T.Shape();eyeShape2.moveTo(.035,.145);eyeShape2.lineTo(.2,.11);eyeShape2.lineTo(.2,.055);eyeShape2.lineTo(.075,.08);eyeShape2.closePath();
      addMesh(new T.ShapeGeometry(eyeShape2),greenGlow,0,3.02,.535);
      const nose=box(.085,.23,.07,steelDark,0,2.94,.535);
      const noseHighlight=box(.025,.19,.018,steelLight,0,2.95,.578);
      // Mouth grille and chin seam.
      for(let n=0;n<5;n++)box(.25-(Math.abs(2-n)*.03),.018,.025,black,0,2.78+n*-.043,.54);
      box(.25,.023,.02,steelLight,0,2.565,.535);
      line([[-.35,3.1,.54],[-.24,3.18,.55],[0,3.2,.555],[.24,3.18,.55],[.35,3.1,.54]],steelLight,.011);
      for(const s of [-1,1]){
        for(const y of [3.23,3.0,2.77,2.61]){
          sphere(.028,.028,.02,steelLight,s*.395,y,.535);
        }
      }
      // Helmet ridges, riveted brow, and an armoured hood clasp.
      line([[-.43,3.37,.26],[-.27,3.51,.22],[0,3.57,.2],[.27,3.51,.22],[.43,3.37,.26]],armorEdge,.035);
      box(.14,.14,.075,steelDark,0,2.39,.05);
      const clasp=sphere(.07,.07,.04,greenGlow,0,2.39,.105);
      // etched green rune accents on the gauntlets and upper chest.
      line([[-.76,1.44,.44],[-.69,1.36,.445],[-.76,1.27,.445]],greenDim,.012);
      line([[.76,1.44,.44],[.69,1.36,.445],[.76,1.27,.445]],greenDim,.012);
      line([[-.23,1.99,.46],[-.17,1.93,.46],[-.23,1.86,.46]],greenDim,.012);
      line([[.23,1.99,.46],[.17,1.93,.46],[.23,1.86,.46]],greenDim,.012);

      // Procedural, volumetric-looking green vapor sprites; no external image assets.
      const smokeCanvas=document.createElement('canvas');smokeCanvas.width=128;smokeCanvas.height=128;
      const ctx=smokeCanvas.getContext('2d');
      if(ctx){
        const grad=ctx.createRadialGradient(64,64,2,64,64,63);
        grad.addColorStop(0,'rgba(136,255,81,0.42)');grad.addColorStop(.22,'rgba(66,218,31,0.23)');grad.addColorStop(.55,'rgba(31,119,19,0.1)');grad.addColorStop(1,'rgba(8,42,5,0)');
        ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
      }
      const smokeTexture=new T.CanvasTexture(smokeCanvas);resources.push(smokeTexture);
      let seed=13;
      const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
      const smoke=[];
      for(let i=0;i<34;i++){
        const mat=new T.SpriteMaterial({map:smokeTexture,color:i%4===0?0xa4ff80:0x55fa2a,transparent:true,opacity:.1+random()*.13,depthWrite:false,blending:T.AdditiveBlending});
        resources.push(mat);
        const sprite=new T.Sprite(mat);
        const width=.55+random()*1.25,height=.8+random()*1.5;
        sprite.scale.set(width,height,1);
        scene.add(sprite);
        smoke.push({sprite,x:(random()-.5)*3.4,z:(random()-.5)*1.9,phase:random()*4,speed:.24+random()*.48,width,height,opacity:.06+random()*.11});
      }
      const emberGeo=new T.BufferGeometry();
      const emberPositions=new Float32Array(100*3);
      for(let i=0;i<100;i++){emberPositions[i*3]=(random()-.5)*3.7;emberPositions[i*3+1]=random()*4.0;emberPositions[i*3+2]=(random()-.5)*2.0;}
      emberGeo.setAttribute('position',new T.BufferAttribute(emberPositions,3));
      const emberMat=new T.PointsMaterial({color:0x83ff48,size:.025,transparent:true,opacity:.7,depthWrite:false});
      resources.push(emberGeo,emberMat);
      const embers=new T.Points(emberGeo,emberMat);scene.add(embers);

      const resize=()=>{
        const rect=host.getBoundingClientRect();
        const w=Math.max(1,Math.floor(rect.width)),h=Math.max(1,Math.floor(rect.height));
        camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
      };
      resize();
      if('ResizeObserver' in window){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);}
      window.addEventListener('resize',resize);
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const clock=new T.Clock();
      let previous=0;
      const tick=()=>{
        const elapsed=clock.getElapsedTime();
        const delta=Math.min(.05,Math.max(0,elapsed-previous));previous=elapsed;
        const targetFov=controlsRef.current.cinematic?28:35;
        if(reduced)camera.fov=targetFov;
        else if(Math.abs(camera.fov-targetFov)>.025)camera.fov=T.MathUtils.lerp(camera.fov,targetFov,.045);
        camera.updateProjectionMatrix();
        const tiltX=parseFloat(host.closest('.doom-scene')?.style.getPropertyValue('--doom-tilt-x')||'0')||0;
        const tiltZ=parseFloat(host.closest('.doom-scene')?.style.getPropertyValue('--doom-tilt-z')||'0')||0;
        tiltRig.rotation.x=T.MathUtils.lerp(tiltRig.rotation.x,tiltX*Math.PI/180,.08);
        tiltRig.rotation.z=T.MathUtils.lerp(tiltRig.rotation.z,tiltZ*Math.PI/180,.08);
        if(!reduced&&controlsRef.current.rotationOn)spinRig.rotation.y+=delta*(Math.PI*2/31);
        floatRig.position.y=reduced||!controlsRef.current.rotationOn?0:Math.sin(elapsed*1.2)*.045;
        for(const particle of smoke){
          particle.sprite.visible=controlsRef.current.smokeOn;
          if(controlsRef.current.smokeOn){
            const phase=(particle.phase+elapsed*particle.speed)%4.2;
            particle.sprite.position.set(particle.x+Math.sin(elapsed*.8+particle.phase)*.15,-.35+phase,particle.z);
            particle.sprite.material.opacity=reduced?particle.opacity*.4:particle.opacity*(.3+.7*Math.sin((phase/4.2)*Math.PI));
            particle.sprite.scale.set(particle.width*(.7+phase*.12),particle.height*(.7+phase*.1),1);
          }
        }
        embers.visible=controlsRef.current.embersOn;
        embers.rotation.y=reduced?0:elapsed*.025;
        renderer.render(scene,camera);
        if(document.visibilityState!=='hidden')raf=requestAnimationFrame(tick);
        else raf=0;
      };
      const handleVisibilityChange=()=>{
        if(document.visibilityState==='hidden'){cancelAnimationFrame(raf);raf=0;}
        else if(!raf){previous=clock.getElapsedTime();raf=requestAnimationFrame(tick);}
      };
      document.addEventListener('visibilitychange',handleVisibilityChange);
      tick();
      return ()=>{
        cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',handleVisibilityChange);window.removeEventListener('resize',resize);resizeObserver?.disconnect();
        resources.forEach(resource=>resource?.dispose?.());
        renderer?.dispose();renderer?.domElement?.remove();
      };
    }catch(error){
      host.closest('.doom-scene')?.classList.remove('webgl-ready');
      host.dataset.renderError='true';
      console.error('CYRUS Doom WebGL scene could not start:',error);
    }
  },[]);
  return <div className={'cyrus-hero-visual doom-scene'+(cinematic?' doom-cinematic':'')+(!smokeOn?' doom-no-smoke':'')} onPointerMove={handlePointerMove} onPointerLeave={resetPointer}>
    <div className="doom-atmosphere" aria-hidden="true"><i/><i/><i/><span className="doom-rune-ring"/></div>
    <div ref={sceneRef} className="doom-webgl-root" aria-label="Animated three-dimensional Doctor Doom character" role="img"/>
    <div className="doom-css-fallback" aria-hidden="true">
      <div className="doom-fallback-cape"/><div className="doom-fallback-hood"/><div className="doom-fallback-mask"><i/><i/><b/><span/><span/><span/><span/></div>
      <div className="doom-fallback-armor"><i/><b/><span/></div>
    </div>
    <div className="doom-smoke" aria-hidden="true"><span className="doom-smoke-puff puff-a"/><span className="doom-smoke-puff puff-b"/><span className="doom-smoke-puff puff-c"/><span className="doom-smoke-puff puff-d"/><span className="doom-smoke-puff puff-e"/><span className="doom-ground-fog"/></div>
    <div className="doom-character-label"><i/><span>VICTOR VON DOOM</span><b>LATVERIA / PRIME</b></div>
    <div className="doom-character-controls" role="group" aria-label="3D character scene controls">
      <button type="button" className={rotationOn?'selected':''} aria-pressed={rotationOn} onClick={()=>setRotationOn(value=>!value)} title={rotationOn?'Pause character rotation':'Resume character rotation'}><span aria-hidden="true">{rotationOn?'◉':'Ⅱ'}</span><b>{rotationOn?'ROTATION ON':'ROTATION PAUSED'}</b></button>
      <button type="button" className={smokeOn?'selected':''} aria-pressed={smokeOn} onClick={()=>setSmokeOn(value=>!value)} title={smokeOn?'Disable green smoke':'Enable green smoke'}><span aria-hidden="true">〰</span><b>SMOKE {smokeOn?'ON':'OFF'}</b></button>
      <button type="button" className={embersOn?'selected':''} aria-pressed={embersOn} onClick={()=>setEmbersOn(value=>!value)} title={embersOn?'Hide emerald particles':'Show emerald particles'}><span aria-hidden="true">✧</span><b>PARTICLES {embersOn?'ON':'OFF'}</b></button>
      <button type="button" className={cinematic?'selected':''} aria-pressed={cinematic} onClick={()=>setCinematic(value=>!value)} title={cinematic?'Exit cinematic mode':'Enter cinematic mode'}><span aria-hidden="true">⛶</span><b>{cinematic?'EXIT CINEMA':'CINEMATIC'}</b></button>
      <button type="button" className="doom-reset-view" onClick={resetSceneView} title="Reset character tilt"><span aria-hidden="true">↺</span><b>RESET VIEW</b></button>
    </div>
    <div className="doom-hud doom-hud-left"><span>ARMOR STATUS</span><b><i/> ACTIVE</b><small>Vibranium-steel alloy</small></div>
    <div className="doom-hud doom-hud-right"><span>CORE REACTOR</span><b>{busy?'OVERDRIVE':'STABLE'}</b><small>{currentAgents.length||7} agents · {runtimeState}</small></div>
    <div className="cyrus-nameplate doom-nameplate"><small>RULER OF LATVERIA</small><strong>DOCTOR DOOM</strong><em>VICTOR VON DOOM / CYRUS EDITION</em></div>
    <div className="cyrus-scroll-cue"><span>ENTER THE GREEN KINGDOM</span><i/></div>
  </div>;
}

function HomeView({go,runtimeState,busy,agents,openPalette,openApiSettings}){
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
      <div className="home-nav-tools"><button className={'home-status home-status-button '+(runtimeState==='ONLINE'?'online':runtimeState==='OFFLINE'?'offline':'')} onClick={openApiSettings} title="Configure live backend connection"><i/>{runtimeState}</button><button className="home-command-key" onClick={openApiSettings} title="Configure backend API">API ↗</button><button className="home-command-key" onClick={openPalette} title="Open command palette">⌘ K</button></div>
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
        ['05','Execution History','Filter, review and export your recorded task history.','History'],
        ['06','Platform & Runtime','See live API health, provider mode, execution metrics, security and verification boundaries.','Platform']
      ].map(([num,title,desc,target])=><button className="home-surface-card" key={target} onClick={()=>go(target)}><span>{num} / SURFACE</span><h3>{title}</h3><p>{desc}</p><b>Open surface ↗</b></button>)}</div>
      <footer className="home-footer"><span>CYRUS-07 / ORIGINAL FICTIONAL AI CHARACTER</span><span>{runtimeState} · {busy?'EXECUTING':'READY'}</span></footer>
    </section>
    <section className="home-platform-preview">
      <div className="home-section-label">02 / BEHIND THE INTERFACE</div>
      <div className="home-next-heading"><h2>See what is real.<br/><em>Know what is still a draft.</em></h2><p>CYRUS exposes its runtime status and makes the boundary between generated suggestions, static checks, and verified execution explicit.</p></div>
      <div className="home-platform-preview-grid">
        <article><span>01 / OBSERVE</span><b>Live service signals</b><p>Inspect API health, active workers, capacity, task history and the configured model mode.</p></article>
        <article><span>02 / INSPECT</span><b>Trace each stage</b><p>Follow the orchestration graph and open draft artifacts, review findings and static-analysis output.</p></article>
        <article><span>03 / VERIFY</span><b>Evidence over claims</b><p>Generated checklists are not reported as passed tests. Python snippets are parsed without running untrusted code.</p></article>
      </div>
      <button className="home-platform-cta" onClick={()=>go('Platform')}>Explore platform & live diagnostics <b>↗</b></button>
    </section>
  </main>
}

function PlatformView({go,notify,open}){
  const [snapshot,setSnapshot]=useState({health:null,provider:null,security:null,metrics:null,tasks:null});
  const [refreshing,setRefreshing]=useState(false);
  const [updatedAt,setUpdatedAt]=useState(null);
  const [refreshTick,setRefreshTick]=useState(0);

  useEffect(()=>{
    let active=true;
    let inFlight=false;
    const refresh=async()=>{
      if(inFlight)return;
      inFlight=true;
      if(active)setRefreshing(true);
      const names=['health','provider','security','metrics','tasks'];
      const paths=['/api/health','/api/provider','/api/security','/api/metrics','/api/tasks?limit=8'];
      const results=await Promise.allSettled(paths.map(path=>apiJson(path)));
      if(active){
        const next={};
        results.forEach((result,index)=>{
          next[names[index]]=result.status==='fulfilled'
            ?{data:result.value,error:null}
            :{data:null,error:result.reason?.message||'Endpoint unavailable'};
        });
        setSnapshot(next);
        setUpdatedAt(new Date().toISOString());
        setRefreshing(false);
      }
      inFlight=false;
    };
    refresh();
    const timer=window.setInterval(refresh,12000);
    return()=>{active=false;window.clearInterval(timer)};
  },[refreshTick]);

  const health=snapshot.health?.data;
  const provider=snapshot.provider?.data;
  const security=snapshot.security?.data;
  const metrics=snapshot.metrics?.data;
  const recent=Array.isArray(snapshot.tasks?.data)?snapshot.tasks.data:[];
  const apiHealthy=health?.status==='ok';
  const providerMode=provider?.mode||health?.mode||'UNKNOWN';
  const locked=security?.api_access_key_required??health?.api_access_key_required;
  const stamp=updatedAt?new Date(updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Awaiting first response';
  const uptime=seconds=>{
    const value=Math.max(0,Math.floor(Number(seconds)||0));
    const days=Math.floor(value/86400),hours=Math.floor((value%86400)/3600),minutes=Math.floor((value%3600)/60);
    return days?days+'d '+hours+'h':hours?hours+'h '+minutes+'m':minutes+'m '+(value%60)+'s';
  };
  const statusClass=value=>String(value||'unknown').toLowerCase().replace(/[^a-z0-9_-]/g,'-');

  const stages=[
    {n:'01',name:'ORCHESTRATOR',short:'Initialize',detail:'Validate the submitted objective, assign a run ID, establish a shared execution record and expose progress.'},
    {n:'02',name:'PLANNER',short:'Decompose',detail:'Generate a structured plan that breaks the objective into ordered, reviewable work packages.'},
    {n:'03',name:'RESEARCHER',short:'Consider',detail:'Surface engineering considerations and likely risks. Current provider mode does not perform live web research.'},
    {n:'04',name:'CODER',short:'Draft',detail:'Create an implementation brief and code examples. Generated content is stored as a draft; repository files are not edited.'},
    {n:'05',name:'TESTER',short:'Inspect',detail:'Create a proposed test plan and run non-executing static checks such as Python syntax parsing and likely-secret scanning.'},
    {n:'06',name:'REVIEWER',short:'Assess',detail:'Review the draft and its risks. Model scores are estimates, not benchmarks or proof that software works.'},
    {n:'07',name:'RELEASE',short:'Package',detail:'Store a task record, review summary, static-analysis report and implementation artifacts for later inspection.'}
  ];
  const liveFeatures=[
    {state:'LIVE API',title:'Health & capacity',desc:'Health checks report release, uptime, provider selection, active tasks and worker utilization.',tag:'GET /api/health'},
    {state:'LIVE STREAM',title:'Execution trace',desc:'Server-Sent Events carry task state and stage events, with reconnect support through event IDs.',tag:'GET /api/tasks/{id}/stream'},
    {state:'LIVE DATA',title:'Task history',desc:'Read task summaries, search old runs, inspect artifacts and export history from the History workspace.',tag:'GET /api/tasks'},
    {state:'LIVE CHECKS',title:'Draft static analysis',desc:'Parse fenced Python without execution, inspect format, and flag likely secrets or risky execution primitives.',tag:'static-analysis.json'},
    {state:'OPTIONAL',title:'Model-backed drafting',desc:'When a server-side provider key is configured, request objective-specific plans, drafts and review outputs.',tag:'CYRUS_LLM_API_KEY'},
    {state:'GUARDED',title:'Supervised approvals',desc:'Supervised runs pause for an explicit operator approval before the packaging stage.',tag:'POST /api/tasks/{id}/approve'}
  ];
  return <div className="section-page page-platform">
    <PageHero eyebrow="PLATFORM / SYSTEM EXPLAINER" title="Inside" accent=" CYRUS" description="A real API-backed control surface with observable execution stages, model-provider diagnostics, draft analysis and explicit verification boundaries." image={CYRUS_IMAGES.spotlight} alt="Connected digital infrastructure representing a software runtime" meta="LIVE RUNTIME / OPERATOR GUIDE" imageCaption="HOW THE PLATFORM WORKS"/>
    <section className="platform-live-console">
      <div className="platform-live-head">
        <div><span className="editorial-kicker">RUNTIME TELEMETRY / AUTO-REFRESH 12 SEC</span><h2>Live service <em>snapshot.</em></h2><p>These values come from the configured backend APIs. Locked or unavailable data is marked instead of guessed.</p></div>
        <button className="platform-refresh-button" onClick={()=>setRefreshTick(value=>value+1)} disabled={refreshing}>{refreshing?'SYNCING…':'↻ REFRESH NOW'}</button>
      </div>
      <div className="platform-live-statusline"><span className={'platform-state-dot '+(apiHealthy?'healthy':snapshot.health?.error?'unreachable':'pending')}/><b>{apiHealthy?'API RESPONDING':snapshot.health?.error?'API UNREACHABLE':'CONNECTING TO API'}</b><span>Last response · {stamp}</span><a href={apiUrl('/api/health')} target="_blank" rel="noreferrer">Health endpoint ↗</a></div>
      <div className="platform-telemetry-grid">
        <article className="platform-telemetry-card"><span>PROVIDER MODE</span><strong className={providerMode==='LIVE'?'is-live':''}>{providerMode}</strong><small>{provider?.model||'Model identifier unavailable'}</small><p>{provider?.message||(snapshot.provider?.error||'Waiting for provider diagnostics.')}</p></article>
        <article className="platform-telemetry-card"><span>ACTIVE TASKS</span><strong>{metrics?(metrics.active_tasks??0):(snapshot.metrics?.error?'LOCKED':'—')}</strong><small>{metrics?(String(metrics.capacity??'—')+' worker slots configured'):'Private metrics endpoint'}</small><p>{metrics?(Math.round(((metrics.active_tasks||0)/Math.max(1,metrics.capacity||1))*100)+'% of worker capacity in use.'):(snapshot.metrics?.error||'Waiting for metrics.')}</p></article>
        <article className="platform-telemetry-card"><span>RECORDED RUNS</span><strong>{metrics?(metrics.persisted_tasks??0):(snapshot.metrics?.error?'LOCKED':'—')}</strong><small>{metrics?(String(metrics.completed_tasks??0)+' completed · '+String(metrics.failed_tasks??0)+' failed'):'Aggregate runtime metric'}</small><p>{metrics?(String(metrics.awaiting_approval??0)+' awaiting approval · '+String(metrics.cancelled_tasks??0)+' cancelled'):(snapshot.metrics?.error||'Waiting for metrics.')}</p></article>
        <article className="platform-telemetry-card"><span>API ACCESS</span><strong className={locked?'is-guarded':''}>{locked===true?'KEY REQUIRED':locked===false?'OPEN API':'UNKNOWN'}</strong><small>{security?.access_key_header||'X-CYRUS-Access-Key'}</small><p>{security?.model_key_in_browser===false?'Model-provider credentials remain server-side.':(snapshot.security?.error||'Waiting for security diagnostics.')}</p></article>
      </div>
      <div className="platform-live-foot"><span>RELEASE <b>{health?.release||'—'}</b></span><span>UPTIME <b>{metrics?uptime(metrics.uptime_seconds):'—'}</b></span><span>WORKER LOAD <b>{health?Math.round((health.capacity_utilization||0)*100)+'%':'—'}</b></span><span>API <b>{apiHealthy?'HTTP OK':'NOT VERIFIED'}</b></span></div>
      {(snapshot.metrics?.error||snapshot.tasks?.error)&&<div className="platform-access-notice"><strong>Some telemetry needs access.</strong><p>{snapshot.metrics?.error||snapshot.tasks?.error}. If you enabled CYRUS_API_ACCESS_KEY on Render, open API ↗ and enter that access key. Public health/provider diagnostics can work while private task metrics stay locked.</p><button onClick={()=>go('Command')}>Open Command ↗</button></div>}
    </section>

    <section className="page-section platform-lifecycle-section">
      <div className="section-heading"><div><span className="editorial-kicker">THE EXECUTION LIFECYCLE / 07 STAGES</span><h2>From prompt to <em>inspectable output.</em></h2></div><p>Each stage updates the task record and emits events so the operator can see where a run is, what changed, and what has not been verified.</p></div>
      <div className="platform-lifecycle-grid">{stages.map((stage,i)=><article className="platform-stage-card" key={stage.name}><div className="platform-stage-top"><span>{stage.n}</span><i>{i===0?'●':i===6?'↗':'◇'}</i></div><h3>{stage.name}</h3><strong>{stage.short}</strong><p>{stage.detail}</p><div className="platform-stage-connect"><span/>{i<stages.length-1?'NEXT STAGE':'TRACEABLE HANDOFF'}</div></article>)}</div>
      <div className="platform-explanation-note"><b>Why seven stages?</b><span>Splitting the workflow makes each responsibility and transition inspectable. It does not imply seven independent AI models; the configured provider may power multiple stages.</span></div>
    </section>

    <section className="platform-capabilities-section">
      <div className="section-heading"><div><span className="editorial-kicker">CAPABILITIES / CONNECTED TO THE RUNTIME</span><h2>What the system <em>actually does.</em></h2></div><p>These are documented runtime behaviors—not promises of tools that are only represented in the interface.</p></div>
      <div className="platform-capability-grid">{liveFeatures.map((feature,i)=><article className="platform-capability-card" key={feature.title}><div className="platform-capability-meta"><span>{String(i+1).padStart(2,'0')} / {feature.state}</span><i>{['◉','≋','◫','⌕','✳','✓'][i]}</i></div><h3>{feature.title}</h3><p>{feature.desc}</p><code>{feature.tag}</code></article>)}</div>
    </section>

    <section className="page-spotlight platform-verification-spotlight">
      <img src={CYRUS_IMAGES.code} alt="Code displayed on a monitor" loading="lazy"/>
      <div><span className="editorial-kicker">VERIFICATION / NO FAKE GREEN CHECKS</span><h2>Static analysis is useful.<br/><em>It is not a test suite.</em></h2><p>CYRUS checks output structure, parses fenced Python snippets, looks for common secret patterns, and flags risky execution patterns. It does not run the generated application. Runtime correctness, integration behavior and test coverage remain unverified until a separate sandbox and test runner exist.</p><div className="spotlight-pills"><span>AST syntax parse</span><span>Secret patterns</span><span>No code execution</span></div><button className="home-platform-cta" onClick={()=>go('Command')}>Run an objective ↗</button></div>
    </section>

    <section className="page-section platform-data-section">
      <div className="section-heading"><div><span className="editorial-kicker">OBSERVABILITY / TASK RECORDS</span><h2>Every run leaves a <em>trail.</em></h2></div><p>Inspect recent backend task records when access is available. Task data refreshes with the live snapshot.</p></div>
      {recent.length?<div className="platform-recent-list">{recent.slice(0,6).map(item=><button className="platform-recent-row" key={item.task_id} onClick={()=>open(item)}><span className={'platform-task-dot '+statusClass(item.status)}/><span className="platform-recent-copy"><strong>{item.objective||'Untitled objective'}</strong><small>{item.task_id} · {item.current_agent||'No current agent'} · {item.created_at?new Date(item.created_at).toLocaleString():'timestamp unavailable'}</small></span><span className={'platform-task-status '+statusClass(item.status)}>{String(item.status||'UNKNOWN').replaceAll('_',' ')}</span><b>↗</b></button>)}</div>:<div className="platform-empty-state"><span>RECENT RUNS</span><h3>{snapshot.tasks?.error?'Task telemetry is restricted.':'No stored tasks found yet.'}</h3><p>{snapshot.tasks?.error||'Run an objective from Command and revisit this section to inspect its live status and artifact history.'}</p><button onClick={()=>go('Command')}>Open Command ↗</button></div>}
    </section>

    <section className="platform-guardrails-section">
      <div className="section-heading"><div><span className="editorial-kicker">GUARDRAILS / OPERATIONAL CONTRACT</span><h2>Power with <em>clear boundaries.</em></h2></div><p>Security and reliability are part of the interface—not hidden in a README.</p></div>
      <div className="platform-guardrails-grid">
        <article><span>01 / CREDENTIALS</span><h3>Secrets stay server-side</h3><p>The model provider key belongs in Render Environment. The optional API access key is separate and can be entered in the connection dialog, stored per browser tab, and sent via a request header.</p></article>
        <article><span>02 / EXECUTION</span><h3>No arbitrary code runner</h3><p>Generated code is a reviewable draft. CYRUS does not execute code from the model or imply that syntax checks prove runtime correctness.</p></article>
        <article><span>03 / PERSISTENCE</span><h3>Know your storage tier</h3><p>The current JSON history file is on the service filesystem. On a free Render instance, treat this history as non-durable across restarts; a managed database is a future hardening step.</p></article>
        <article><span>04 / MODEL MODE</span><h3>Demo versus live model</h3><p>DEMO means deterministic fallback behavior. LIVE means a model provider is configured; a successful model-backed task is still the final check that the provider responds.</p></article>
      </div>
    </section>

    <section className="platform-next-section">
      <div><span className="editorial-kicker">NEXT / BUILD ON THE FOUNDATION</span><h2>Make the next step <em>measurable.</em></h2><p>Open a command, inspect a run, or check your actual service settings before enabling a model-backed workflow.</p></div>
      <div className="platform-next-actions"><button className="home-primary" onClick={()=>go('Command')}>Open Command <b>↗</b></button><button className="home-secondary" onClick={()=>go('History')}>Browse execution history <b>↗</b></button><button className="home-secondary" onClick={()=>window.dispatchEvent(new CustomEvent('cyrus:open-api-settings'))}>API connection settings <b>↗</b></button></div>
    </section>
  </div>
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
function TaskModal({task,close}){return <div className="modal-back" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>CLOSE</button><div className="eyebrow">{task.task_id}</div><h3>Execution Record</h3><p className="objective-text">{task.objective}</p><div className="metrics">{[['SCORE',task.score||0],['CONFIDENCE',(task.confidence||0)+'%'],['QUALITY',(task.quality||0)+'%'],['COVERAGE',(task.coverage||0)+'%'],['TOOLS',task.tool_calls||0],['LATENCY',(task.latency_ms||0)+' ms'],['RISK',task.risk||'—'],['STATUS',task.status]].map(x=><div className="metric" key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong></div>)}</div>{task.static_analysis?.checks?.length>0&&<section className="static-analysis-panel"><div className="section-title"><strong>STATIC ANALYSIS</strong><span>{task.static_analysis.checks_passed||0} PASS · {task.static_analysis.checks_failed||0} FAIL</span></div><p className="static-analysis-caption">Non-executing checks on the generated draft. Python snippets are parsed, never run; proposed application tests and coverage remain unverified.</p><div className="static-check-list">{task.static_analysis.checks.map((check,i)=><div className="static-check-row" key={check.name||i}><span className={'static-check-status '+String(check.status||'SKIP').toLowerCase()}>{check.status}</span><div><strong>{check.name.replaceAll('_',' ')}</strong><p>{check.detail}</p></div></div>)}</div></section>}<div className="section-title"><strong>ARTIFACTS</strong><span>{task.artifacts?.length||0}</span></div>{task.artifacts?.length?<div className="artifacts">{task.artifacts.map(a=><div className="artifact" key={a.name}><div><strong>{a.name}</strong><small>{a.language} · {a.type}</small></div><small>{a.size}</small></div>)}</div>:<div className="empty">No artifacts in this historical snapshot.</div>}{task.implementation&&<details className="artifact-content-panel"><summary>OPEN IMPLEMENTATION DRAFT · {task.implementation.length.toLocaleString()} CHARACTERS</summary><pre>{task.implementation}</pre></details>}{task.validation_plan?.length?<details className="artifact-content-panel"><summary>VALIDATION PLAN · {task.validation_plan.length} PROPOSED CHECKS · NOT EXECUTED</summary><ol>{task.validation_plan.map((check,i)=><li key={i}>{check}</li>)}</ol></details>:null}{task.review?.summary&&<div className="artifact-review-note"><div className="section-title"><strong>REVIEW SUMMARY</strong><span>{task.review.risk||'UNASSESSED'} RISK</span></div><p>{task.review.summary}</p>{task.review.findings?.length>0&&<ul>{task.review.findings.map((finding,i)=><li key={i}>{finding}</li>)}</ul>}<small>{task.score_method||'Review basis unavailable'}</small></div>}<div className="section-title" style={{marginTop:18}}><strong>EXECUTION TRACE</strong><span>{task.events?.length||0} EVENTS</span></div>{task.events?.length?<div className="trace modal-trace">{task.events.map(e=><div className="trace-row" key={e.event_id||e.time+e.agent}><span className="time mono">{e.time}</span><span className="agent mono">{e.agent}</span><span className="phase mono">{e.phase}</span><span className="msg">{e.message}</span><span className="dur mono">{e.duration} ms</span></div>)}</div>:<div className="empty">No persisted trace.</div>}{task.plan?.length?<><div className="section-title"><strong>PLAN</strong><span>{task.plan.length} STEPS</span></div><div className="detail-list">{task.plan.map((item,i)=><div className="detail-row" key={item}><span>{String(i+1).padStart(2,'0')}</span><strong>{item}</strong></div>)}</div></>:null}</div></div>}
function CommandPalette({page,go,execute,seedObjective,notify,close}){const [query,setQuery]=useState('');const [cursor,setCursor]=useState(0);const actions=[...NAV_ITEMS.map(item=>({label:item,type:'surface',run:()=>go(item)})),{label:'Run example objective',type:'action',run:()=>{setQuery('');close();notify('Launching the example objective');setTimeout(()=>execute(),80)}}];const items=useMemo(()=>actions.filter(x=>x.label.toLowerCase().includes(query.toLowerCase())),[query]);useEffect(()=>setCursor(0),[query]);useEffect(()=>{const onKey=e=>{if(e.key==='ArrowDown'){e.preventDefault();setCursor(i=>items.length?(i+1)%items.length:0)}if(e.key==='ArrowUp'){e.preventDefault();setCursor(i=>items.length?(i-1+items.length)%items.length:0)}if(e.key==='Enter'&&items[cursor]){e.preventDefault();items[cursor].run()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[items,cursor]);return <div className="command-palette-back" onClick={close}><div className="command-palette" onClick={e=>e.stopPropagation()}><div className="palette-head"><span className="eyebrow">COMMAND</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Jump to a CYRUS surface or run an action..." /></div><div className="palette-list">{items.length?items.map((item,i)=><button key={item.label} className={'palette-item '+(cursor===i?'active':'')} onMouseEnter={()=>setCursor(i)} onClick={item.run}><span>{item.label}</span><small>{cursor===i?(item.type==='action'?'ENTER · RUN':'ENTER · OPEN'):(item.type==='action'?'EXECUTE':'SURFACE')}</small></button>):<div className="empty">No CYRUS command matches that query.</div>}</div></div></div>}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>)

