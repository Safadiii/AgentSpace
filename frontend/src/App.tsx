import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleDot, Command, Crown, Feather, Hammer, Layers3, Pause, Play,
  Plus, Search, Send, Sparkles, X, Zap,
} from 'lucide-react'
import { api } from './api/api'
import ResearchPage from './ResearchPage'
import type { Agent, AgentId, AgentStatus, AgentTask, HubState } from './types'

const agentIcons = { zeus: Crown, athena: BookOpen, hermes: Feather, hephaestus: Hammer }
const markerLabels: Record<AgentId, string> = {
  zeus: 'The orchestrator', athena: 'Research & knowledge', hermes: 'Communication', hephaestus: 'Engineering',
}
const statusText: Record<AgentStatus, string> = {
  working: 'Working', available: 'Available', idle: 'Idle', paused: 'Paused',
}
const initial: HubState = { agents: [], tasks: [], events: [] }

function relative(iso: string) {
  const difference = Math.max(0, Date.now() - new Date(iso).getTime())
  if (difference < 60_000) return 'Just now'
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`
  return `${Math.floor(difference / 86_400_000)}d ago`
}
function agentName(agents: Agent[], id: AgentId | null) {
  return agents.find(a => a.id === id)?.name ?? 'Olympus'
}
function taskFor(tasks: AgentTask[], id: AgentId) {
  return tasks.find(t => t.agent_id === id && (t.status === 'running' || t.status === 'paused'))
}
function navigateToWorkspace() {
  document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function AgentPin({ agent, onOpen }: { agent: Agent; onOpen: (id: AgentId) => void }) {
  const Icon = agentIcons[agent.id]
  return (
    <button
      className={`agent-pin agent-pin--${agent.id}`}
      type="button"
      aria-label={`Open ${agent.name}, ${agent.status}`}
      onClick={() => onOpen(agent.id)}
    >
      <span className="pin-orbit"><Icon size={17} strokeWidth={1.6} /><i className={`pin-dot status-${agent.status}`} /></span>
      <span className="pin-tooltip">
        <strong>{agent.name}</strong><small>{markerLabels[agent.id]}</small>
      </span>
    </button>
  )
}

export default function App() {
  const [route, setRoute] = useState<'home' | 'research'>(() => window.location.pathname.startsWith('/research') ? 'research' : 'home')
  const [state, setState] = useState<HubState>(initial)
  const [isDemo, setIsDemo] = useState(false)
  const [selected, setSelected] = useState<AgentId | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [target, setTarget] = useState<AgentId | 'auto'>('auto')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [atWorkspace, setAtWorkspace] = useState(false)
  const [filter, setFilter] = useState<'all' | AgentStatus>('all')
  const commandRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLTextAreaElement>(null)
  const [panelPrompt, setPanelPrompt] = useState('')

  const openResearch = () => {
    window.history.pushState(null, '', '/research')
    setSelected(null)
    setCommandOpen(false)
    setRoute('research')
    window.scrollTo(0, 0)
  }
  const returnHome = () => {
    window.history.pushState(null, '', '/')
    setRoute('home')
    window.scrollTo(0, 0)
  }

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname.startsWith('/research') ? 'research' : 'home')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const refresh = useCallback(async () => {
    const fresh = await api.state()
    setState(fresh)
    setIsDemo(api.isDemo())
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const interval = window.setInterval(() => { if (!api.isDemo()) void refresh() }, 12_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    let frame = 0
    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const stage = document.getElementById('mountain-stage')
        const length = stage ? stage.offsetHeight - window.innerHeight : 1
        const pct = Math.max(0, Math.min(1, window.scrollY / Math.max(length, 1)))
        setProgress(pct)
        setAtWorkspace(window.scrollY > window.innerHeight * 0.82)
      })
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.cancelAnimationFrame(frame) }
  }, [])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSelected(null); setCommandOpen(v => !v)
      }
      if (event.key === 'Escape') { setSelected(null); setCommandOpen(false) }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])
  useEffect(() => { if (commandOpen) commandRef.current?.focus() }, [commandOpen])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(id)
  }, [notice])

  const currentAgent = state.agents.find(a => a.id === selected)
  const countWorking = state.agents.filter(a => a.status === 'working').length
  const openAgent = (id: AgentId) => { setPanelPrompt(''); setSelected(id); setCommandOpen(false) }
  const visibleAgents = useMemo(() => state.agents.filter(a => filter === 'all' || a.status === filter), [filter, state.agents])

  async function act(task: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true)
    try { await task(); await refresh(); setNotice(message); return true }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Something went wrong.'); return false }
    finally { setBusy(false) }
  }
  async function submitDirective(title: string, desired: AgentId | 'auto') {
    const clean = title.trim()
    if (clean.length < 3) { setNotice('Please enter at least three characters.'); return }
    const ok = await act(() => api.createTask(clean, desired === 'auto' ? null : desired), 'Directive recorded. Open the workspace to follow its status.')
    if (ok) { setCommand(''); setPanelPrompt(''); setCommandOpen(false) }
  }
  const heroStyle = { '--hero-zoom': 1 + progress * 0.085, '--hero-shift': `${progress * 1.5}%`, '--hero-fade': Math.max(0, (progress - 0.62) / .38) } as CSSProperties

  if (route === 'research') return <ResearchPage onBack={returnHome} />

  return (
    <div className="app-shell">
      <header className={`site-header ${atWorkspace ? 'site-header--solid' : ''}`}>
        <button className="command-trigger" type="button" onClick={() => { setSelected(null); setCommandOpen(true) }}>
          <Search size={17}/><span>Ask anything...</span><kbd><Command size={12}/> K</kbd>
        </button>
        <button className="research-entry" type="button" onClick={openResearch}><BookOpen size={16}/> Research <ArrowUpRight size={14}/></button>
      </header>

      <main>
        <section className="mountain-stage" id="mountain-stage" aria-label="Interactive Olympus mountain">
          <div className="mountain-sticky" style={heroStyle}>
            <div className="mountain-art" aria-hidden="true" />
            <div className="mountain-wash" aria-hidden="true" />
            <div className="mountain-exit-wash" aria-hidden="true" />
            <div className="mountain-sky-copy">
              <span className="overline overline--dark">A HOME FOR EVERY INTELLIGENCE</span>
              <h1>Many minds.<br/><em>One Olympus.</em></h1>
              <p>Your autonomous world, in harmony.</p>
            </div>
            <div className="agent-pin-layer">
              {state.agents.map(a => <AgentPin key={a.id} agent={a} onOpen={openAgent} />)}
            </div>
            <div className="hero-bottom">
              <div className="system-whisper"><span className="live-dot"/><span>{countWorking} at work</span><i /> <span>{state.agents.length} in the pantheon</span></div>
              <button className="scroll-cue" type="button" onClick={navigateToWorkspace}>Explore the pantheon <span><ArrowDown size={17}/></span></button>
            </div>
          </div>
        </section>

        <section className="workspace" id="workspace">
          <div className="workspace-content">
            <div className="section-entrance">
              <div>
                <span className="overline">THE INTELLIGENCE LAYER <span className="overline-line" /></span>
                <h2>Under the surface<span className="period">.</span></h2>
                <p>A clear view of every mind working on your behalf.</p>
              </div>
              <button className="primary-action" type="button" onClick={() => { setTarget('auto'); setCommandOpen(true) }}><Plus size={17}/> New directive</button>
            </div>
            <div className="metrics-ribbon">
              <div><strong>{state.agents.length.toString().padStart(2, '0')}</strong><span>Total agents</span></div>
              <div><strong>{countWorking.toString().padStart(2, '0')}</strong><span>At work</span></div>
              <div><strong>{state.tasks.filter(t => t.status === 'running' || t.status === 'queued').length.toString().padStart(2, '0')}</strong><span>Open directives</span></div>
              <div className="ribbon-note"><Sparkles size={16}/><span>Quietly orchestrated by Zeus.</span></div>
            </div>

            <div className="agents-heading">
              <div><span className="overline">01 / YOUR PANTHEON</span><h3>Agents</h3></div>
              <div className="filter-controls" aria-label="Filter agents">
                {(['all', 'working', 'available', 'idle', 'paused'] as const).map(f => (
                  <button key={f} className={filter === f ? 'filter-active' : ''} type="button" onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className="agent-list">
              {visibleAgents.map(a => {
                const Icon = agentIcons[a.id]
                const task = taskFor(state.tasks, a.id)
                return <button type="button" key={a.id} className="agent-row" onClick={() => openAgent(a.id)}>
                  <span className="agent-identity"><span className="agent-glyph"><Icon size={20} strokeWidth={1.55}/></span><span className="agent-names"><strong>{a.name}</strong><small>{a.role}</small></span></span>
                  <span className="agent-row-task">{task?.title || (a.id === 'zeus' ? 'Overseeing the pantheon' : 'No active directive')}</span>
                  <span className={`status-label status-label--${a.status}`}><i/>{statusText[a.status]}</span>
                  <ArrowUpRight className="row-arrow" size={18}/>
                </button>
              })}
              {visibleAgents.length === 0 && <div className="empty-filter">No agents have this status.</div>}
            </div>

            <div className="lower-grid">
              <div className="ledger">
                <div className="ledger-head"><div><span className="overline">02 / WORK IN MOTION</span><h3>Directives</h3></div><span className="section-counter">{state.tasks.length.toString().padStart(2, '0')}</span></div>
                {state.tasks.length ? state.tasks.slice(0, 5).map(task => (
                  <div className="task-item" key={task.id}>
                    <div className="task-icon"><Layers3 size={16}/></div>
                    <div className="task-detail"><strong>{task.title}</strong><small>{agentName(state.agents, task.agent_id)} <span>·</span> {relative(task.created_at)}</small></div>
                    <span className={`task-status task-status--${task.status}`}>{task.status}</span>
                    {task.status === 'running' && <button className="complete-task" type="button" disabled={busy} onClick={() => void act(() => api.completeTask(task.id), 'Directive marked complete.')} aria-label={`Mark ${task.title} complete`} title="Mark complete"><Check size={17}/></button>}
                  </div>
                )) : <div className="empty-ledger"><span className="empty-icon"><Layers3 size={19}/></span><strong>No directives yet.</strong><span>Give Zeus a goal to begin.</span><button type="button" onClick={() => setCommandOpen(true)}>Create your first directive <ArrowRight size={14}/></button></div>}
              </div>
              <div className="ledger">
                <div className="ledger-head"><div><span className="overline">03 / THE CHRONICLE</span><h3>Recent activity</h3></div><CircleDot size={18} className="ledger-deco"/></div>
                {state.events.slice(0, 5).map(item => <div className="activity-item" key={item.id}><span className="activity-bead"/><div><p>{item.message}</p><span>{relative(item.created_at)}</span></div></div>)}
              </div>
            </div>
            <footer className="page-footer"><div className="footer-mark"><Zap size={14}/> OLYMPUS</div><span>Built for many minds. Designed for one purpose.</span><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Return to the summit ↑</button></footer>
          </div>
        </section>
      </main>

      {selected && currentAgent && <div className="overlay-zone">
        <button className="panel-scrim" aria-label="Close agent details" type="button" onClick={() => setSelected(null)} />
        <aside className="agent-panel" role="dialog" aria-modal="true" aria-label={`${currentAgent.name} control panel`}>
          <div className="panel-header"><span className="overline">THE PANTHEON / {currentAgent.name.toUpperCase()}</span><button type="button" className="close-button" onClick={() => setSelected(null)} aria-label="Close panel"><X size={19}/></button></div>
          <div className="panel-main">
            <span className="panel-symbol">{(() => { const Icon = agentIcons[currentAgent.id]; return <Icon size={31} strokeWidth={1.25}/> })()}</span>
            <h2>{currentAgent.name}</h2><p className="panel-role">{currentAgent.role}</p><p className="panel-description">{currentAgent.description}</p>
            {currentAgent.id === 'athena' && <button className="athena-research-link" type="button" onClick={openResearch}><BookOpen size={16}/> Open Research Library <ArrowRight size={16}/></button>}
            <div className="panel-rule"/>
            <div className="panel-status"><span className="overline">CURRENT STATE</span><span className={`status-label status-label--${currentAgent.status}`}><i/>{statusText[currentAgent.status]}</span></div>
            <div className="panel-current"><span className="overline">IN PROGRESS</span><p>{taskFor(state.tasks, currentAgent.id)?.title || (currentAgent.id === 'zeus' ? 'Ready to coordinate your next directive.' : 'Awaiting your next directive.')}</p></div>
            <div className="panel-rule"/>
            <form className="panel-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void submitDirective(panelPrompt, currentAgent.id) }}>
              <label className="overline" htmlFor="agent-prompt">{currentAgent.id === 'zeus' ? 'GIVE ZEUS A GOAL' : `DIRECT ${currentAgent.name.toUpperCase()}`}</label>
              <textarea id="agent-prompt" ref={panelRef} value={panelPrompt} onChange={e => setPanelPrompt(e.target.value)} rows={4} placeholder={currentAgent.id === 'zeus' ? 'What should Olympus work on next?' : `What should ${currentAgent.name} do?`} />
              <button disabled={busy || !panelPrompt.trim()} type="submit" className="send-action">{currentAgent.id === 'zeus' ? 'Delegate through Zeus' : 'Assign directive'} <ArrowRight size={16}/></button>
            </form>
          </div>
          <div className="panel-footer">
            {currentAgent.id !== 'zeus' && <button type="button" className="panel-toggle" disabled={busy} onClick={() => void act(() => api.toggleAgent(currentAgent.id), `${currentAgent.name} status updated.`)}>{currentAgent.status === 'paused' ? <Play size={15}/> : <Pause size={15}/>} {currentAgent.status === 'paused' ? 'Resume agent' : 'Pause agent'}</button>}
            <span className="panel-footer-note">{currentAgent.id === 'zeus' ? 'Central orchestration' : 'Connected to Olympus'} <CheckCircle2 size={14}/></span>
          </div>
        </aside>
      </div>}

      {commandOpen && <div className="overlay-zone command-zone">
        <button className="command-scrim" type="button" aria-label="Close command" onClick={() => setCommandOpen(false)} />
        <form className="command-dialog" role="dialog" aria-modal="true" aria-label="New Olympus directive" onSubmit={e => { e.preventDefault(); void submitDirective(command, target) }}>
          <div className="command-dialog-top"><div><span className="command-glyph"><Zap size={17}/></span><strong>Speak to Olympus</strong></div><button type="button" className="close-button" onClick={() => setCommandOpen(false)} aria-label="Close command"><X size={18}/></button></div>
          <textarea ref={commandRef} value={command} onChange={e => setCommand(e.target.value)} placeholder="Describe a goal, ask a question, or delegate a task..." rows={4}/>
          <div className="command-dialog-bottom">
            <label className="target-picker">Delegate to <ChevronDown size={13}/><select aria-label="Choose agent" value={target} onChange={e => setTarget(e.target.value as AgentId | 'auto')}><option value="auto">Zeus decides</option><option value="athena">Athena</option><option value="hermes">Hermes</option><option value="hephaestus">Hephaestus</option></select></label>
            <button className="command-submit" type="submit" disabled={busy || !command.trim()}>{busy ? 'Sending...' : 'Create directive'} <ArrowRight size={15}/></button>
          </div>
          <p className="command-hint"><Sparkles size={13}/> Directives are recorded and routed. Agent execution is not wired up yet.</p>
        </form>
      </div>}
      {notice && <div className="toast" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={15}/></button></div>}
      {isDemo && <div className="preview-watermark" title="Local-only preview data. Start FastAPI for persistent state.">PREVIEW MODE <span/></div>}
      <button className="floating-command" type="button" aria-label="New Olympus directive" onClick={() => setCommandOpen(true)}><Send size={19}/></button>
    </div>
  )
}
