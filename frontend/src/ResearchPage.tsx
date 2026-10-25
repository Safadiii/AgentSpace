import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark,
  Check, ChevronDown, Command, Compass, Copy, Crown,
  FileText, Folder, FolderPlus,
  MessageCircle, NotebookPen,
  PanelRightClose, PanelRightOpen, Plus, Search, Sparkles, X, BookText
} from 'lucide-react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Badge } from './components/ui/badge'
import { Separator } from './components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from './components/ui/dialog'
import './research.css'

type LibraryView = 'all' | 'saved' | `collection:${string}`
type ResearchAction = 'summarize' | 'ask' | 'compare' | 'notes' | 'collection'

type Paper = {
  id: string
  title: string
  authors: string
  year: string
  abstract: string
  tags: string[]
  saved: boolean
  collection: string
  sourceUrl?: string
  addedAt: string
}

// UI seed data. Replace with the Athena research API when the endpoints are ready.
const examplePapers: Paper[] = [
  {
    id: 'attention', title: 'Attention Is All You Need',
    authors: 'Vaswani et al.', year: '2017', saved: false,
    collection: 'Transformers', tags: ['AI', 'NLP', 'Transformers'],
    abstract: 'The Transformer introduced an attention-based architecture for sequence transduction, replacing recurrence with attention mechanisms. This design allows the model to process sequences with greater parallelization, establishing a foundation for many subsequent language models.',
    sourceUrl: 'https://arxiv.org/abs/1706.03762', addedAt: '2026-10-23T12:00:00.000Z',
  },
  {
    id: 'rag', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    authors: 'Lewis et al.', year: '2020', saved: true,
    collection: 'Language Models', tags: ['LLM', 'Retrieval', 'NLP'],
    abstract: 'This paper presents retrieval-augmented generation, bringing together a parametric language model and a non-parametric retrieval index. The approach explores how retrieved documents can support knowledge-intensive generation tasks.',
    sourceUrl: 'https://arxiv.org/abs/2005.11401', addedAt: '2026-10-22T11:00:00.000Z',
  },
  {
    id: 'react', title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
    authors: 'Yao et al.', year: '2023', saved: false,
    collection: 'Agents', tags: ['Agents', 'Reasoning', 'LLM'],
    abstract: 'ReAct explores the combination of reasoning traces and task-specific actions within language models. By interleaving these steps, language models can interact with external environments and use feedback to inform subsequent decisions.',
    sourceUrl: 'https://arxiv.org/abs/2210.03629', addedAt: '2026-10-21T10:00:00.000Z',
  },
  {
    id: 'scaling', title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan et al.', year: '2020', saved: true,
    collection: 'Language Models', tags: ['Scaling', 'LLM', 'Systems'],
    abstract: 'This work investigates the relationship between language-model performance and quantities such as model size, dataset size, and training compute, identifying empirical patterns useful for understanding model scaling.',
    sourceUrl: 'https://arxiv.org/abs/2001.08361', addedAt: '2026-10-20T09:00:00.000Z',
  },
  {
    id: 'generative', title: 'Generative Agents: Interactive Simulacra of Human Behavior',
    authors: 'Park et al.', year: '2023', saved: true,
    collection: 'Agents', tags: ['Agents', 'Simulation', 'LLM'],
    abstract: 'Generative Agents describes a framework for believable interactive agents that use memory, reflection, and planning. The research explores how these elements can support coherent behavior in a simulated social environment.',
    sourceUrl: 'https://arxiv.org/abs/2304.03442', addedAt: '2026-10-19T12:00:00.000Z',
  },
]

const STORAGE_KEY = 'olympus:research-papers:v2'
const COLLECTIONS_KEY = 'olympus:research-collections:v1'
function readCollections(): string[] {
  try {
    const raw = window.localStorage.getItem(COLLECTIONS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(c => typeof c === 'string')) return parsed as string[]
    }
  } catch { /* Local storage may be unavailable. */ }
  return []
}
function readPapers(): Paper[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(p => p && typeof p.id === 'string' && typeof p.title === 'string')) {
        return parsed as Paper[]
      }
    }
  } catch { /* Local storage may be unavailable; demo data still works. */ }
  return examplePapers
}

const actionInfo: Record<ResearchAction, { label: string; description: string }> = {
  summarize: { label: 'Summarize paper', description: 'Prepare a concise, structured research summary.' },
  ask: { label: 'Ask Research Agent', description: 'Ask a question about the selected paper.' },
  compare: { label: 'Compare papers', description: 'Choose a second paper for a side-by-side analysis.' },
  notes: { label: 'Extract key notes', description: 'Prepare an extraction request for the research agent.' },
  collection: { label: 'Save to collection', description: 'Organize this paper in your library.' },
}

export default function ResearchPage({ onBack }: { onBack: () => void }) {
  const [papers, setPapers] = useState<Paper[]>(readPapers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<LibraryView>('all')
  const [search, setSearch] = useState('')
  const [extraCollections, setExtraCollections] = useState<string[]>(readCollections)
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [action, setAction] = useState<ResearchAction | null>(null)
  const [draftCollection, setDraftCollection] = useState('')
  const [question, setQuestion] = useState('')
  const [compareId, setCompareId] = useState('')
  const [notification, setNotification] = useState('')
  const [mobileLibrary, setMobileLibrary] = useState(false)
  const [agentOpen, setAgentOpen] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(papers)) } catch { /* Non-persistent demo fallback */ }
  }, [papers])

  useEffect(() => {
    try { window.localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(extraCollections)) } catch { /* Non-persistent fallback */ }
  }, [extraCollections])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!notification) return
    const timeout = window.setTimeout(() => setNotification(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notification])

  const selected = selectedId ? papers.find(p => p.id === selectedId) ?? null : null
  const collections = useMemo(() => [...new Set([...papers.map(p => p.collection), ...extraCollections].filter(Boolean))].sort(), [papers, extraCollections])
  const filtered = useMemo(() => papers.filter(p => {
    const matchesSearch = `${p.title} ${p.authors} ${p.tags.join(' ')} ${p.collection}`.toLowerCase().includes(search.toLowerCase().trim())
    const matchesView = view === 'all' || (view === 'saved' && p.saved) || (view.startsWith('collection:') && p.collection === view.slice(11))
    return matchesSearch && matchesView
  }), [papers, search, view])
  const savedCount = papers.filter(p => p.saved).length
  const otherPapers = papers.filter(p => p.id !== selected?.id)
  const compared = otherPapers.find(p => p.id === compareId) ?? otherPapers[0]

  function updatePaper(id: string, patch: Partial<Paper>) {
    setPapers(current => current.map(p => p.id === id ? { ...p, ...patch } : p))
  }
  function chooseView(next: LibraryView) {
    setView(next)
    setSelectedId(null)
    setMobileLibrary(false)
  }
  const viewTitle = view === 'all' ? 'All Papers' : view === 'saved' ? 'Saved' : view.slice(11)
  function openPaper(id: string) {
    setSelectedId(id)
    setMobileLibrary(false)
  }
  function createCollection(event: { preventDefault: () => void }) {
    event.preventDefault()
    const name = newCollectionName.trim()
    if (!name) return
    if (collections.some(c => c.toLowerCase() === name.toLowerCase())) {
      setNotification('That collection already exists.')
      return
    }
    setExtraCollections(current => [...current, name])
    chooseView(`collection:${name}`)
    setNewCollectionName('')
    setNewCollectionOpen(false)
    setNotification(`Collection "${name}" created.`)
  }
  async function copyText(text: string, success = 'Copied to clipboard.') {
    try { await navigator.clipboard.writeText(text); setNotification(success) }
    catch { setNotification('Clipboard unavailable. Please copy the text manually.') }
  }
  function actionPrompt() {
    if (!selected) return ''
    const link = selected.sourceUrl ?? 'No URL available'
    if (action === 'summarize') return `Summarize the research paper "${selected.title}" (${selected.authors}, ${selected.year}). Source: ${link}. Include the research question, method, key findings, limitations, and future directions. Cite the source where possible.`
    if (action === 'ask') return `Regarding the paper "${selected.title}" (${link}): ${question.trim() || 'Explain its central contribution and how it works.'}`
    if (action === 'compare') return `Compare the research papers "${selected.title}" (${link}) and "${compared?.title ?? ''}" (${compared?.sourceUrl ?? 'No URL available'}). Contrast the problem, methods, findings, limitations, and practical implications.`
    return `Extract actionable research notes from "${selected.title}" (${link}). Organize them by problem, proposed method, evidence, contributions, limitations, and follow-up questions.`
  }
  function saveCollection() {
    if (!selected || !draftCollection.trim()) return
    updatePaper(selected.id, { collection: draftCollection.trim(), saved: true })
    setNotification(`Saved to ${draftCollection.trim()}.`)
    setAction(null)
  }
  function chooseAction(next: ResearchAction) {
    if (selected) setDraftCollection(selected.collection)
    setQuestion('')
    setCompareId(otherPapers[0]?.id ?? '')
    setAction(next)
  }

  return (
    <div className="research-os">
      <div className="research-scene" aria-hidden="true" />
      <header className="research-topbar">
        <button type="button" className="research-breadcrumb" onClick={onBack} aria-label="Return to Olympus">
          <span className="research-brand-emblem"><Crown size={20} strokeWidth={1.55} /></span>
          <span className="research-brand-name">Olympus</span>
          <span className="research-breadcrumb-slash">/</span>
          <span className="research-breadcrumb-current">Research</span>
        </button>
        <div className="research-global-search">
          <Search size={17} strokeWidth={1.8} />
          <Input ref={searchRef} aria-label="Search papers" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your research library..." className="research-search-input" />
          <kbd><Command size={12} /> K</kbd>
        </div>
        <div className="research-header-right">
          <span className="research-header-identity"><Sparkles size={15}/> Athena's library</span>
        </div>
      </header>

      <main className={agentOpen ? 'research-layout' : 'research-layout research-layout--agent-collapsed'}>
        <aside className={`research-library research-surface ${mobileLibrary ? 'research-library--open' : ''}`}>
          <div className="research-library-heading">
            <div><span className="research-eyebrow">YOUR RESEARCH</span><h2>My Library</h2></div>
          </div>
          <nav className="research-nav" aria-label="Research library">
            <button type="button" className={view === 'all' ? 'research-nav-row active' : 'research-nav-row'} onClick={() => chooseView('all')}><BookOpen size={17}/> All Papers <span>{papers.length}</span></button>
            <button type="button" className={view === 'saved' ? 'research-nav-row active' : 'research-nav-row'} onClick={() => chooseView('saved')}><Bookmark size={17}/> Saved <span>{savedCount}</span></button>
          </nav>
          <Separator className="research-rule" />
          <div className="research-collection-title"><span>COLLECTIONS</span><button type="button" className="research-collection-add" aria-label="Add collection" title="Add collection" onClick={() => setNewCollectionOpen(true)}><Plus size={15}/></button></div>
          <div className="research-collections">
            {collections.map(name => <button type="button" key={name} className={view === `collection:${name}` ? 'research-collection active' : 'research-collection'} onClick={() => chooseView(`collection:${name}`)}><Folder size={15}/><span>{name}</span><small>{papers.filter(p => p.collection === name).length}</small></button>)}
          </div>
          <div className="research-library-bottom"><span className="research-green-dot"/> Demo library <span>·</span> Saved in this browser</div>
        </aside>

        <section className="research-content research-surface" aria-label={selected ? 'Selected paper details' : 'Paper list'}>
          <div className={selected ? 'research-content-crumb' : 'research-content-crumb research-content-crumb--list'}>
            <div className="research-content-left"><Button type="button" variant="ghost" size="sm" className="research-mobile-library-button" onClick={() => setMobileLibrary(v => !v)}><BookOpen size={15}/> Library <ChevronDown size={14}/></Button>
              {selected
                ? <button type="button" className="research-back" onClick={() => setSelectedId(null)}><ArrowLeft size={14}/> {viewTitle.toUpperCase()}</button>
                : <span className="research-desktop-crumb">LIBRARY <span>/</span> {viewTitle.toUpperCase()}</span>}
            </div>
          </div>
          {selected ? <>
            <div className="research-document-top">
              <span className="research-eyebrow">RESEARCH PAPER <span className="research-dot-separator">·</span> {selected.year}</span>
              <h1>{selected.title}</h1>
              <p className="research-authors">{selected.authors}</p>
              <div className="research-metadata-line"><span>{selected.year}</span><span className="research-meta-bullet">·</span><span>{selected.collection}</span>{selected.sourceUrl && <><span className="research-meta-bullet">·</span><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Original source <ArrowUpRight size={12}/></a></>}</div>
              <div className="research-tag-row">{selected.tags.map(t => <Badge className="research-tag" variant="secondary" key={t}>{t}</Badge>)}</div>
            </div>
            <Separator className="research-content-divider" />
            <div className="research-document-section">
              <div className="research-section-title"><span className="research-section-index">01</span><h2>Abstract</h2></div>
              {selected.abstract ? <p className="research-abstract">{selected.abstract}</p> : <p className="research-abstract research-placeholder-copy">No abstract yet. Once Athena is connected to your research service, paper metadata and the abstract can appear here automatically.</p>}
            </div>
            <div className="research-source-footer"><span><BookText size={15}/> Paper information</span><button type="button" onClick={() => chooseAction('summarize')}>Ask the Research Agent <ArrowRight size={15}/></button></div>
          </> : <div className="research-list-view">
            <div className="research-list-title"><span className="research-eyebrow">{search.trim() ? 'SEARCH RESULTS' : 'YOUR RESEARCH'}</span><h1>{viewTitle}</h1><p>{filtered.length} {filtered.length === 1 ? 'paper' : 'papers'}</p></div>
            <div className="research-card-list">
              {filtered.map(p => <button key={p.id} type="button" className="research-paper-card" onClick={() => openPaper(p.id)}>
                <span className="research-paper-icon"><BookText size={25} strokeWidth={1.5}/></span>
                <span className="research-paper-row-details">
                  <strong>{p.title}</strong>
                  <small>{p.authors} <span>·</span> {p.year} <span>·</span> {p.collection}</small>
                  <span className="research-paper-tags">{p.tags.slice(0, 3).map(t => <i key={t}>{t}</i>)}</span>
                </span>
                <ArrowRight size={16} className="research-action-arrow"/>
              </button>)}
              {filtered.length === 0 && <div className="research-empty-list">No papers found.<button type="button" onClick={() => { chooseView('all'); setSearch('') }}>Show all papers</button></div>}
            </div>
          </div>}
        </section>

        <aside className={agentOpen ? 'research-companion research-surface' : 'research-companion research-companion--collapsed research-surface'} aria-label="Research Agent">
          {agentOpen ? <>
          <div className="research-companion-heading"><span className="research-ai-mark"><Sparkles size={20} strokeWidth={1.4}/></span><div><h2>Research Agent</h2><p>Powered by Athena · UI preview</p></div><Button type="button" variant="ghost" size="icon" className="research-agent-toggle" aria-label="Collapse Research Agent" title="Collapse" onClick={() => setAgentOpen(false)}><PanelRightClose size={18}/></Button></div>
          <div className="research-companion-copy">{selected ? 'Your tools, right where you need them.' : 'Open a paper to use the agent.'}</div>
          <div className="research-action-list">
            {([
              { key: 'summarize', icon: Sparkles, subtitle: 'A concise, structured overview' },
              { key: 'ask', icon: MessageCircle, subtitle: 'Explore ideas and ask questions' },
              { key: 'compare', icon: Compass, subtitle: 'Explore differences and overlaps' },
              { key: 'notes', icon: NotebookPen, subtitle: 'Capture methods and key findings' },
              { key: 'collection', icon: FolderPlus, subtitle: 'Organize in your library' },
            ] as const).map(({ key, icon: Icon, subtitle }) => <button key={key} className="research-agent-action" type="button" disabled={!selected} onClick={() => chooseAction(key)}><span className="research-agent-icon"><Icon size={18} strokeWidth={1.65}/></span><span><strong>{actionInfo[key].label}</strong><small>{subtitle}</small></span><ArrowRight size={16} className="research-action-arrow"/></button>)}
          </div>
          <Separator className="research-rule" />
          {selected && <div className="research-paper-details"><span className="research-aside-eyebrow">PAPER DETAILS</span><div><FileText size={16}/><span>{selected?.year || '—'} publication year</span></div><div><Folder size={16}/><span>{selected?.collection || '—'}</span></div></div>}
          <div className="research-companion-footer"><span className="research-quiet-symbol">✦</span> Focused knowledge, calmly organized.</div>
          </> : <button type="button" className="research-agent-rail" aria-label="Expand Research Agent" title="Expand Research Agent" onClick={() => setAgentOpen(true)}><PanelRightOpen size={18}/><span className="research-ai-mark"><Sparkles size={18} strokeWidth={1.4}/></span><span className="research-agent-rail-label">Research Agent</span></button>}
        </aside>
      </main>

      <footer className="research-footer"><span>OLYMPUS / ATHENA</span><span>Research, in harmony.</span><button type="button" onClick={onBack}><ArrowLeft size={14}/> Return to Olympus</button></footer>

      <Dialog open={newCollectionOpen} onOpenChange={open => { setNewCollectionOpen(open); if (!open) setNewCollectionName('') }}>
        <DialogContent className="research-dialog"><DialogHeader><div className="research-dialog-icon"><FolderPlus size={21}/></div><DialogTitle>New collection</DialogTitle><DialogDescription>Group related papers together. Collections are saved in this browser.</DialogDescription></DialogHeader>
          <form className="research-form" onSubmit={createCollection}>
            <label htmlFor="new-collection-name">Collection name</label><Input id="new-collection-name" autoFocus value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="e.g. Reinforcement Learning" required />
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setNewCollectionOpen(false)}>Cancel</Button><Button type="submit" disabled={!newCollectionName.trim()}><Plus size={15}/> Create collection</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={action !== null} onOpenChange={open => { if (!open) setAction(null) }}>
        <DialogContent className="research-dialog"><DialogHeader><div className="research-dialog-icon"><Sparkles size={21}/></div><DialogTitle>{action ? actionInfo[action].label : ''}</DialogTitle><DialogDescription>{action ? actionInfo[action].description : ''} {action !== 'collection' && 'This is a frontend preview; agent execution is not connected yet.'}</DialogDescription></DialogHeader>
          {action === 'collection' ? <div className="research-action-form"><label htmlFor="collection-name">Collection</label><Input id="collection-name" value={draftCollection} onChange={e => setDraftCollection(e.target.value)} placeholder="Collection name"/><div className="research-collection-suggestions">{collections.map(c => <button key={c} className={draftCollection === c ? 'is-active' : ''} type="button" onClick={() => setDraftCollection(c)}><Folder size={13}/>{c}</button>)}</div><DialogFooter><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button onClick={saveCollection} disabled={!draftCollection.trim()}>Save to collection</Button></DialogFooter></div> : action ? <div className="research-action-form">
            {action === 'ask' && <><label htmlFor="ask-question">Your question</label><textarea className="research-dialog-textarea" id="ask-question" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What assumptions does this method make?"/></>}
            {action === 'compare' && <><label htmlFor="compare-paper">Compare with</label><select id="compare-paper" className="research-dialog-select" value={compared?.id ?? ''} onChange={e => setCompareId(e.target.value)}>{otherPapers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></>}
            <div className="research-instruction-label">INSTRUCTION PREVIEW <span>Copy to use with Athena when connected</span></div><div className="research-instruction-preview">{actionPrompt()}</div>
            <DialogFooter><Button variant="ghost" onClick={() => setAction(null)}>Close</Button><Button disabled={action === 'compare' && !compared} onClick={() => void copyText(actionPrompt(), 'Agent instruction copied.') }><Copy size={15}/> Copy instruction</Button></DialogFooter>
          </div> : null}
        </DialogContent>
      </Dialog>

      {notification && <div className="research-toast" role="status"><Check size={15}/>{notification}<button type="button" onClick={() => setNotification('')} aria-label="Dismiss"><X size={13}/></button></div>}
    </div>
  )
}