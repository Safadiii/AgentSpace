import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { SPRING } from './lib/motion'
import { api } from './api/api'
import ResearchPage from './ResearchPage'
import DotField from './components/shell/DotField'
import TopPill from './components/shell/TopPill'
import type { Route } from './components/shell/TopPill'
import AgentSheet from './components/hub/AgentSheet'
import CommandDialog from './components/hub/CommandDialog'
import { ActivityItem, DirectiveItem, GodRow } from './components/hub/AgentParts'
import { Button } from './components/ui/button'
import { useTheme } from './hooks/useTheme'
import { statusText } from './lib/format'
import type { AgentId, AgentStatus, AgentTask, HubState } from './types'

const EMPTY: HubState = { agents: [], tasks: [], events: [] }
const pad = (n: number) => String(n).padStart(2, '0')
const routeFromPath = (): Route => (window.location.pathname.startsWith('/research') ? 'research' : 'home')
const taskFor = (tasks: AgentTask[], id: AgentId) => tasks.find(t => t.agent_id === id && (t.status === 'running' || t.status === 'paused'))

export default function App() {
  const { theme, toggle } = useTheme()
  const [route, setRoute] = useState<Route>(routeFromPath)
  const [state, setState] = useState<HubState>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [filter, setFilter] = useState<'all' | AgentStatus>('all')
  const [selected, setSelected] = useState<AgentId | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [target, setTarget] = useState<AgentId | 'auto'>('auto')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const navigate = useCallback((next: Route) => {
    window.history.pushState(null, '', next === 'home' ? '/' : '/research')
    setSheetOpen(false); setCommandOpen(false); setRoute(next); window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const refresh = useCallback(async () => {
    const fresh = await api.state()
    setState(fresh); setIsDemo(api.isDemo()); setLoaded(true)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const id = window.setInterval(() => { if (!api.isDemo()) void refresh() }, 12_000)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (route !== 'home') return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSheetOpen(false); setCommandOpen(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(id)
  }, [notice])

  const agentById = useCallback((id: AgentId | null) => state.agents.find(a => a.id === id), [state.agents])
  const working = state.agents.filter(a => a.status === 'working').length
  const open = state.tasks.filter(t => t.status === 'running' || t.status === 'queued').length
  const visibleAgents = useMemo(() => state.agents.filter(a => filter === 'all' || a.status === filter), [filter, state.agents])
  const openAgent = (id: AgentId) => { setSelected(id); setCommandOpen(false); setSheetOpen(true) }

  async function act(task: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true)
    try { await task(); await refresh(); setNotice(message); return true }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Something went wrong.'); return false }
    finally { setBusy(false) }
  }
  async function submitDirective(title: string, desired: AgentId | 'auto'): Promise<boolean> {
    const clean = title.trim()
    if (clean.length < 3) { setNotice('Please enter at least three characters.'); return false }
    const ok = await act(() => api.createTask(clean, desired === 'auto' ? null : desired), 'Directive recorded and routed.')
    if (ok) { setCommand(''); setCommandOpen(false); setSheetOpen(false) }
    return ok
  }

  const sheetAgent = agentById(selected)

  return (
    <MotionConfig reducedMotion="user">
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <DotField active={route === 'home'} />
      <div className="scroll-edge" aria-hidden="true" />
      <TopPill route={route} theme={theme} onNavigate={navigate} onToggleTheme={toggle} onCommand={() => { setSheetOpen(false); setCommandOpen(true) }} />

      <main id="main" className="main">
        <motion.div key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        {route === 'research' ? <ResearchPage /> : (
          <div className="console">
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-copy">
                <h1 id="hero-title">Many minds. <b>One workspace.</b></h1>
                <p>Delegate a goal, watch each agent work, and keep a record of what changed.</p>
                <div className="hero-actions">
                  <Button onClick={() => setCommandOpen(true)}><Plus size={15} aria-hidden="true" /> New directive</Button>
                  <Button variant="outline" onClick={() => navigate('research')}>Open research <ArrowRight size={14} aria-hidden="true" /></Button>
                </div>
                <dl className="hero-stats">
                  <div><dt>Agents</dt><dd className="mono">{loaded ? pad(state.agents.length) : '–'}</dd></div>
                  <div><dt>At work</dt><dd className="mono">{loaded ? pad(working) : '–'}</dd></div>
                  <div><dt>Open directives</dt><dd className="mono">{loaded ? pad(open) : '–'}</dd></div>
                </dl>
                {isDemo && <p className="demo-note" title="The API did not respond, so this view uses sample data stored in your browser. Start the FastAPI server for persistent state.">Preview data stored in this browser</p>}
              </div>
              <div className="god-anchor god-anchor--hero" data-god="temple" aria-hidden="true" />
            </section>

            <section className="gods-section" aria-labelledby="agents-title">
              <div className="panel-head">
                <h2 id="agents-title">Agents</h2>
                <div className="chips" role="group" aria-label="Filter agents by status">
                  {(['all', 'working', 'available', 'idle', 'paused'] as const).map(f => (
                    <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : statusText[f]}</button>
                  ))}
                </div>
              </div>
              {!loaded
                ? Array.from({ length: 2 }, (_, i) => <span key={i} className="skeleton god-skeleton" aria-hidden="true" />)
                : visibleAgents.length
                  ? visibleAgents.map(a => <GodRow key={a.id} agent={a} index={state.agents.indexOf(a)} task={taskFor(state.tasks, a.id)} onOpen={openAgent} />)
                  : <p className="empty">No agents are {filter} right now.</p>}
            </section>

            <div className="work">
              <section className="glass panel-pad" aria-labelledby="dir-title">
                <div className="panel-head"><h2 id="dir-title">Directives</h2><span className="mono count">{pad(state.tasks.length)}</span></div>
                {state.tasks.length
                  ? <ul className="list"><AnimatePresence initial={false}>{state.tasks.slice(0, 5).map(t => <DirectiveItem key={t.id} task={t} agent={agentById(t.agent_id)} busy={busy} onComplete={id => void act(() => api.completeTask(id), 'Directive marked complete.')} />)}</AnimatePresence></ul>
                  : <div className="empty">No directives yet. Give Zeus a goal to begin.<br /><Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>Create your first directive</Button></div>}
              </section>
              <section className="glass panel-pad" aria-labelledby="act-title">
                <div className="panel-head"><h2 id="act-title">Recent activity</h2></div>
                {state.events.length
                  ? <ul className="list"><AnimatePresence initial={false}>{state.events.slice(0, 5).map(e => <ActivityItem key={e.id} event={e} agent={agentById(e.agent_id)} />)}</AnimatePresence></ul>
                  : <p className="empty">Nothing has happened yet.</p>}
              </section>
            </div>

            <section className="voyage" aria-label="Start a directive">
              <h2 className="sr-only">Direct your pantheon.</h2>
              <div className="voyage-text" data-god="text" data-text="Direct your pantheon." aria-hidden="true" />
              <div className="voyage-sea" data-god="sea" aria-hidden="true" />
              <div className="voyage-cta"><Button onClick={() => setCommandOpen(true)}><Plus size={15} aria-hidden="true" /> New directive</Button></div>
            </section>
            <p className="console-foot">Built for many minds. Designed for one purpose.</p>
          </div>
        )}
        </motion.div>
      </main>

      <AgentSheet agent={sheetAgent} task={sheetAgent ? taskFor(state.tasks, sheetAgent.id) : undefined} open={sheetOpen} busy={busy}
        onOpenChange={setSheetOpen}
        onSubmit={title => submitDirective(title, sheetAgent?.id ?? 'auto')}
        onToggle={() => sheetAgent && void act(() => api.toggleAgent(sheetAgent.id), `${sheetAgent.name} status updated.`)}
        onOpenResearch={() => navigate('research')} />
      <CommandDialog open={commandOpen} busy={busy} text={command} target={target} onText={setCommand} onTarget={setTarget}
        onOpenChange={setCommandOpen} onSubmit={() => void submitDirective(command, target)} />

      <div className="toast-stack" role="status" aria-live="polite">
        <AnimatePresence>
          {notice && (
            <motion.div key={notice} className="toast" initial={{ opacity: 0, y: 14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14 }} transition={SPRING}>
              <span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </MotionConfig>
  )
}
