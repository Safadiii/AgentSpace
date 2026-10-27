import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark,
  Check, ChevronDown, Command, Compass, Copy, Crown,
  FileText, Folder, FolderPlus,
  MessageCircle, NotebookPen,
  PanelRightClose, PanelRightOpen, Plus, Search, Sparkles, X, BookText, RefreshCw
} from 'lucide-react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Badge } from './components/ui/badge'
import { Separator } from './components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from './components/ui/dialog'
import { researchApi } from './api/researchApi'
import type { PaperRead, PaperDetailedRead, ResearchRunResponse } from './api/researchApi'
import './css/research.css'
import ResearchResultsModal from './components/research/ResearchResultsModal'
import PaperFeedbackActions from './components/research/PaperFeedbackActions'
import type { PaperAction } from './api/researchApi'

type LibraryView = 'all' | 'saved' | `collection:${string}`
type ResearchAction = 'summarize' | 'ask' | 'compare' | 'notes' | 'collection'
type SortKey = 'newest' | 'oldest' | 'title'
type PaperRating = 'LIKE' | 'DISLIKE'
const FEEDBACK_CACHE_PREFIX = 'olympus:research-feedback:v1'

type Paper = {
  id: string
  title: string
  authors: string
  year: string
  abstract: string
  tags: string[]
  saved: boolean // Local bookmark; backend has no favorites endpoint.
  collection: string // Browser-only until a collection API is added.
  sourceUrl?: string
  addedAt: string
}

type LocalPreference = { saved?: boolean; collection?: string }
type LocalPreferences = Record<string, LocalPreference>

const PAGE_SIZE = 20
const PREFERENCES_KEY = 'olympus:research-paper-preferences:v1'
const ABSTRACTS_KEY = 'olympus:research-abstract-cache:v1'
const COLLECTIONS_KEY = 'olympus:research-collections:v1'

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}

function writeJSON(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage may be disabled. */ }
}

function readCollections(): string[] {
  const value = readJSON<unknown>(COLLECTIONS_KEY, [])
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function doiLink(doi?: string | null, openAlexId?: string): string | undefined {
  const value = doi?.trim()
  if (value) return /^https?:\/\//i.test(value) ? value : `https://doi.org/${value.replace(/^doi:/i, '')}`
  return openAlexId?.startsWith('https://') ? openAlexId : undefined
}

function toPaper(p: PaperRead, detail: PaperDetailedRead | undefined, prefs: LocalPreferences, abstracts: Record<string, string>): Paper {
  const id = String(p.id)
  return {
    id,
    title: p.title,
    authors: detail?.authors?.length
      ? [...detail.authors].sort((a, b) => a.author_order - b.author_order).map(a => a.author_name).join(', ')
      : 'Authors not available',
    year: String(p.publication_year ?? detail?.publication_year ?? '—'),
    abstract: p.abstract ?? "",
    tags: detail?.topics?.map(t => t.topic_name).filter(Boolean).slice(0, 4) ?? [],
    saved: prefs[id]?.saved ?? false,
    collection: prefs[id]?.collection ?? '',
    sourceUrl: doiLink(p.doi, p.openalex_id),
    addedAt: '',
  }
}

const yearOf = (p: Paper) => Number.parseInt(p.year, 10) || 0

const runTerminalStatuses = new Set(['completed', 'complete', 'finished', 'success', 'done', 'succeeded', 'failed', 'error', 'cancelled', 'canceled'])
const runSuccessStatuses = new Set(['completed', 'complete', 'finished', 'success', 'done', 'succeeded'])
const isRunDone = (status: string) => runSuccessStatuses.has(status.toLowerCase())

const actionInfo: Record<ResearchAction, { label: string; description: string }> = {
  summarize: { label: 'Summarize paper', description: 'Prepare a concise, structured research summary.' },
  ask: { label: 'Ask Research Agent', description: 'Ask a question about the selected paper.' },
  compare: { label: 'Compare papers', description: 'Choose a second paper for a side-by-side analysis.' },
  notes: { label: 'Extract key notes', description: 'Prepare an extraction request for the research agent.' },
  collection: { label: 'Save to collection', description: 'Organize this paper in your library.' },
}

export default function ResearchPage({ onBack }: { onBack: () => void }) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [preferences, setPreferences] = useState<LocalPreferences>(() => readJSON(PREFERENCES_KEY, {}))
  const [abstracts, setAbstracts] = useState<Record<string, string>>(() => readJSON(ABSTRACTS_KEY, {}))
  const preferencesRef = useRef(preferences)
  const abstractsRef = useRef(abstracts)
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addOpenAlex, setAddOpenAlex] = useState('')
  const [addDoi, setAddDoi] = useState('')
  const [adding, setAdding] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [researchPrompt, setResearchPrompt] = useState('')
  const [researchUserId, setResearchUserId] = useState(import.meta.env.VITE_RESEARCH_USER_ID ?? '')
  const [paperCount, setPaperCount] = useState(5)
  const [startingResearch, setStartingResearch] = useState(false)
  const [researchRun, setResearchRun] = useState<ResearchRunResponse | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  // Runs we've already announced with a toast, so polling never announces the same run twice.
  const announcedRunIds = useRef(new Set<number>())
  const [doneToast, setDoneToast] = useState<{ runId: number } | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState('')
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
  // The agent is a side column on wide screens and a drawer on narrow ones; start it closed on narrow screens.
  const [agentOpen, setAgentOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 1200)
  const [sort, setSort] = useState<SortKey>('newest')
  const [paperRatings, setPaperRatings] = useState<Record<string, PaperRating>>({})
  const [feedbackBusy, setFeedbackBusy] = useState<PaperAction | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const userNumber = Number(researchUserId)
  const activeUserId = Number.isInteger(userNumber) && userNumber > 0 ? userNumber : null

  // Client-side display cache until the backend exposes GET /users/{id}/interactions.
  useEffect(() => {
    setPaperRatings(activeUserId === null ? {} : readJSON<Record<string, PaperRating>>(
      `${FEEDBACK_CACHE_PREFIX}:${activeUserId}`, {}
    ))
  }, [activeUserId])

  useEffect(() => { preferencesRef.current = preferences; writeJSON(PREFERENCES_KEY, preferences) }, [preferences])
  useEffect(() => { abstractsRef.current = abstracts; writeJSON(ABSTRACTS_KEY, abstracts) }, [abstracts])
  useEffect(() => { writeJSON(COLLECTIONS_KEY, extraCollections) }, [extraCollections])

  const loadPapers = useCallback(async (offset = 0, signal?: AbortSignal) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)
    setLibraryError('')
    try {
      // Listing is authoritative. Detailed listing adds author names and topic badges.
      // If the enrichment endpoint fails, still show the basic records.
      const basic = await researchApi.papers(PAGE_SIZE, offset, signal)
      let detail: PaperDetailedRead[] = []
      try { detail = await researchApi.detailedPapers(PAGE_SIZE, offset, signal) }
      catch (error) { if (signal?.aborted) throw error }
      if (signal?.aborted) return
      const detailMap = new Map(detail.map(item => [item.id, item]))
      const mapped = basic.map(p => toPaper(p, detailMap.get(p.id), preferencesRef.current, abstractsRef.current))
      setPapers(old => offset === 0 ? mapped : [...old.filter(p => !mapped.some(m => m.id === p.id)), ...mapped])
      setHasMore(basic.length === PAGE_SIZE)
    } catch (error) {
      if (!signal?.aborted) setLibraryError(error instanceof Error ? error.message : 'Unable to load research papers.')
    } finally {
      if (!signal?.aborted) { setLoading(false); setLoadingMore(false) }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadPapers(0, controller.signal)
    return () => controller.abort()
  }, [loadPapers])

  useEffect(() => {
    if (!selectedId || !/^\d+$/.test(selectedId)) return
    const controller = new AbortController()
    void researchApi.detailedPaper(Number(selectedId), controller.signal).then(detail => {
      if (controller.signal.aborted) return
      setPapers(current => current.map(p => p.id !== selectedId ? p : {
        ...p,
        authors: detail.authors?.length ? [...detail.authors].sort((a, b) => a.author_order - b.author_order).map(a => a.author_name).join(', ') : p.authors,
        tags: detail.topics?.map(t => t.topic_name).slice(0, 4) ?? p.tags,
      }))
    }).catch(() => { /* Enrichment is optional; basic paper data remains visible. */ })
    return () => controller.abort()
  }, [selectedId])

  const fetchRun = useCallback(async (id: number) => {
    setRunLoading(true)
    try {
      const run = await researchApi.run(id)
      setResearchRun(run)
      // Announce a finished run once with a toast; the person opens the results themselves.
      if (runTerminalStatuses.has(run.status.toLowerCase()) && !announcedRunIds.current.has(run.run_id)) {
        announcedRunIds.current.add(run.run_id)
        if (isRunDone(run.status)) setDoneToast({ runId: run.run_id })
        else setNotification(`Research #${run.run_id} ${run.status.toLowerCase()}.`)
      }
      const newAbstracts = Object.fromEntries((run.papers ?? []).filter(p => p.abstract).map(p => [String(p.id), p.abstract as string]))
      if (Object.keys(newAbstracts).length) {
        const updated = { ...abstractsRef.current, ...newAbstracts }
        abstractsRef.current = updated
        setAbstracts(updated)
        setPapers(prev => prev.map(p => newAbstracts[p.id] ? { ...p, abstract: newAbstracts[p.id] } : p))
      }
      if (runTerminalStatuses.has(run.status.toLowerCase())) void loadPapers(0)
    } catch (error) {
      setNotification(error instanceof Error ? error.message : 'Failed to check research run.')
    } finally { setRunLoading(false) }
  }, [loadPapers])

  useEffect(() => {
    if (!researchRun || runTerminalStatuses.has(researchRun.status.toLowerCase())) return
    const timer = window.setInterval(() => { void fetchRun(researchRun.run_id) }, 5000)
    return () => window.clearInterval(timer)
  }, [researchRun?.run_id, researchRun?.status, fetchRun])

  async function addPaper(event: { preventDefault(): void }) {
    event.preventDefault()
    if (!addTitle.trim() || !addOpenAlex.trim()) return
    setAdding(true)
    try {
      const newPaper = await researchApi.createPaper({
        title: addTitle.trim(), openalex_id: addOpenAlex.trim(), doi: addDoi.trim() || null,
      })
      setAddOpen(false)
      setAddTitle(''); setAddOpenAlex(''); setAddDoi('')
      setNotification('Paper added to the research database.')
      await loadPapers(0)
      setSelectedId(String(newPaper.id))
      setView('all')
    } catch (error) { setNotification(error instanceof Error ? error.message : 'Failed to add paper.') }
    finally { setAdding(false) }
  }

  async function launchResearch(event: { preventDefault(): void }) {
    event.preventDefault()
    const userId = Number(researchUserId)
    if (!Number.isInteger(userId) || userId < 1 || !researchPrompt.trim()) {
      setNotification('Enter a valid user ID and a research topic.')
      return
    }
    // The request takes ~30s, so close the dialog right away and let it run in the background.
    const prompt = researchPrompt.trim()
    setStartingResearch(true)
    setPendingPrompt(prompt)
    setDoneToast(null)
    setResearchRun(null)
    setResearchOpen(false)
    setResearchPrompt('')
    setNotification("Research started. We'll let you know when it's ready.")
    try {
      const result = await researchApi.search({ user_id: userId, prompt, paper_count: paperCount })
      setResearchRun({ run_id: result.run_id, status: 'pending', papers: [] })
      void loadPapers(0)
      await fetchRun(result.run_id) // Announces completion with a toast if the run is already done.
    } catch (error) { setNotification(error instanceof Error ? error.message : 'Research request failed.') }
    finally { setStartingResearch(false); setPendingPrompt('') }
  }

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
  }).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    const ya = yearOf(a), yb = yearOf(b)
    if (!ya || !yb) return ya ? -1 : yb ? 1 : 0
    return sort === 'oldest' ? ya - yb : yb - ya
  }), [papers, search, view, sort])
  const savedCount = papers.filter(p => p.saved).length
  const otherPapers = papers.filter(p => p.id !== selected?.id)
  const compared = otherPapers.find(p => p.id === compareId) ?? otherPapers[0]

  function updatePaper(id: string, patch: Partial<Paper>) {
    setPapers(current => current.map(p => p.id === id ? { ...p, ...patch } : p))
    const next = {
      ...preferencesRef.current,
      [id]: {
        ...preferencesRef.current[id],
        ...(patch.saved !== undefined ? { saved: patch.saved } : {}),
        ...(patch.collection !== undefined ? { collection: patch.collection } : {}),
      },
    }
    preferencesRef.current = next
    setPreferences(next)
  }

  // Only update the UI after FastAPI confirms the event was stored.
  async function submitPaperAction(paperId: string, action: PaperAction) {
    if (activeUserId === null) {
      setNotification('Set a backend user ID in New research (or VITE_RESEARCH_USER_ID) first.')
      return
    }
    if (feedbackBusy !== null) return
    const paper = papers.find(item => item.id === paperId)
    if (!paper) return

    setFeedbackBusy(action)
    try {
      await researchApi.interaction(Number(paperId), {
        user_id: activeUserId,
        action,
        source_agent: 'research',
        interaction_metadata: { surface: 'paper_details' },
      })

      if (action === 'LIKE' || action === 'DISLIKE') {
        const key = `${FEEDBACK_CACHE_PREFIX}:${activeUserId}`
        const updated = { ...readJSON<Record<string, PaperRating>>(key, {}), [paperId]: action }
        setPaperRatings(updated)
        writeJSON(key, updated)
        setNotification(action === 'LIKE' ? 'Marked as relevant.' : 'Marked as not relevant.')
      } else if (action === 'SAVE' || action === 'UNSAVE') {
        updatePaper(paperId, { saved: action === 'SAVE' })
        setNotification(action === 'SAVE' ? 'Paper saved.' : 'Paper removed from saved.')
      }
    } catch (error) {
      setNotification(error instanceof Error ? error.message : 'Unable to record paper feedback.')
    } finally {
      setFeedbackBusy(null)
    }
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
    // OPEN is a deliberate navigation event; don't confuse it with READ or IMPRESSION.
    if (activeUserId !== null) {
      void researchApi.interaction(Number(id), {
        user_id: activeUserId,
        action: 'OPEN',
        source_agent: 'research',
        interaction_metadata: { surface: 'library', trigger: 'paper_row' },
      }).catch(error => console.warn('Unable to record paper open:', error))
    }
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

  const showAgent = selected !== null
  const layoutClass = !showAgent ? 'research-layout' : agentOpen ? 'research-layout research-layout--agent' : 'research-layout research-layout--agent-collapsed'
  const countText = loading && papers.length === 0
    ? 'Loading papers…'
    : search.trim()
      ? `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'} for “${search.trim()}”`
      : `${filtered.length} ${filtered.length === 1 ? 'paper' : 'papers'}`
  const agentActions = [
    { key: 'summarize', icon: Sparkles, subtitle: 'A concise, structured overview' },
    { key: 'ask', icon: MessageCircle, subtitle: 'Explore ideas and ask questions' },
    { key: 'compare', icon: Compass, subtitle: 'Differences and overlaps' },
    { key: 'notes', icon: NotebookPen, subtitle: 'Methods and key findings' },
    { key: 'collection', icon: FolderPlus, subtitle: 'Organize in your library' },
  ] as const

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
          <Input ref={searchRef} aria-label="Search your library" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your research library..." className="research-search-input" />
          <kbd><Command size={12} /> K</kbd>
        </div>
        <div className="research-header-right">
          <span className="research-header-identity"><Sparkles size={15}/> Athena's library</span>
        </div>
      </header>

      <main className={layoutClass}>
        <aside className={`research-library research-surface ${mobileLibrary ? 'research-library--open' : ''}`} aria-label="Library navigation">
          <div className="research-library-heading"><h2>Library</h2></div>
          <nav className="research-nav" aria-label="Research library">
            <button type="button" className={view === 'all' ? 'research-nav-row active' : 'research-nav-row'} onClick={() => chooseView('all')}><BookOpen size={17}/> All Papers <span>{papers.length}</span></button>
            <button type="button" className={view === 'saved' ? 'research-nav-row active' : 'research-nav-row'} onClick={() => chooseView('saved')}><Bookmark size={17}/> Saved <span>{savedCount}</span></button>
          </nav>
          <Separator className="research-rule" />
          <div className="research-collection-title"><span>COLLECTIONS</span><button type="button" className="research-collection-add" aria-label="Add collection" title="Add collection" onClick={() => setNewCollectionOpen(true)}><Plus size={15}/></button></div>
          <div className="research-collections">
            {collections.length === 0
              ? <button type="button" className="research-collection-empty" onClick={() => setNewCollectionOpen(true)}><FolderPlus size={15}/> Create your first collection</button>
              : collections.map(name => <button type="button" key={name} className={view === `collection:${name}` ? 'research-collection active' : 'research-collection'} onClick={() => chooseView(`collection:${name}`)}><Folder size={15}/><span>{name}</span><small>{papers.filter(p => p.collection === name).length}</small></button>)}
          </div>
          <div className="research-library-bottom" title="Connected to the research API. Bookmarks and collections are stored in this browser."><span className="research-green-dot"/> Connected</div>
        </aside>

        <section className="research-content research-surface" aria-label={selected ? 'Selected paper details' : 'Paper list'}>
          <div className={selected ? 'research-content-crumb' : 'research-content-crumb research-content-crumb--list'}>
            <div className="research-content-left"><Button type="button" variant="ghost" size="sm" className="research-mobile-library-button" onClick={() => setMobileLibrary(v => !v)}><BookOpen size={15}/> Library <ChevronDown size={14}/></Button>
              {selected && <button type="button" className="research-back" onClick={() => setSelectedId(null)}><ArrowLeft size={14}/> {viewTitle.toUpperCase()}</button>}
            </div>
          </div>
          {selected ? <>
            <div className="research-document-top">
              <span className="research-eyebrow">RESEARCH PAPER <span className="research-dot-separator">·</span> {selected.year}</span>
              <h1>{selected.title}</h1>
              <p className="research-authors">{selected.authors}</p>
              <div className="research-metadata-line"><span>{selected.year}</span>{selected.collection && <><span className="research-meta-bullet">·</span><span>{selected.collection}</span></>}{selected.sourceUrl && <><span className="research-meta-bullet">·</span><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Original source <ArrowUpRight size={12}/></a></>}</div>
              <div className="research-tag-row">{selected.tags.map(t => <Badge className="research-tag" variant="secondary" key={t}>{t}</Badge>)}</div>
              <PaperFeedbackActions
                rating={paperRatings[selected.id] ?? null}
                saved={selected.saved}
                busy={feedbackBusy}
                disabled={activeUserId === null}
                onRate={rating => void submitPaperAction(selected.id, rating)}
                onToggleSave={() => void submitPaperAction(selected.id, selected.saved ? 'UNSAVE' : 'SAVE')}
              />
              {activeUserId === null && <p className="research-feedback-hint">Set a backend user ID in New research to enable feedback.</p>}
            </div>
            <Separator className="research-content-divider" />
            <div className="research-document-section">
              <div className="research-section-title"><span className="research-section-index">01</span><h2>Abstract</h2></div>
              {selected.abstract ? <p className="research-abstract">{selected.abstract}</p> : <p className="research-abstract research-placeholder-copy">Abstract not provided by the saved-paper API. Abstracts from research-run results will appear here when available.</p>}
            </div>
            <div className="research-source-footer"><span><BookText size={15}/> Paper information</span><button type="button" onClick={() => chooseAction('summarize')}>Ask the Research Agent <ArrowRight size={15}/></button></div>
          </> : <div className="research-list-view">
            <div className="research-list-header">
              <h1>{viewTitle}</h1>
              <div className="research-list-actions">
                <Button type="button" variant="ghost" className="research-icon-button" title="Refresh papers" aria-label="Refresh papers" disabled={loading} onClick={() => void loadPapers(0)}><RefreshCw size={15}/></Button>
                <Button type="button" variant="outline" className="research-secondary-button" onClick={() => setAddOpen(true)}><Plus size={15}/> Add paper</Button>
                <Button type="button" className="research-primary-button" disabled={startingResearch} onClick={() => setResearchOpen(true)}><Sparkles size={15}/> New research</Button>
              </div>
            </div>
            {libraryError && <div className="research-api-error" role="alert"><span>{libraryError}</span><Button type="button" variant="outline" size="sm" className="research-secondary-button" onClick={() => void loadPapers(0)}>Retry</Button></div>}
            {startingResearch && <div className="research-run-banner" role="status"><div><span className="research-run-dot research-run-dot--live"/><span>Athena is researching <b>{pendingPrompt.length > 70 ? `${pendingPrompt.slice(0, 70)}…` : pendingPrompt}</b></span></div></div>}
            {!startingResearch && researchRun && <div className="research-run-banner" role="status"><div><span className={`research-run-dot research-run-dot--${runTerminalStatuses.has(researchRun.status.toLowerCase()) ? 'done' : 'live'}`}/><span>Research #{researchRun.run_id} · <b>{researchRun.status}</b> · {researchRun.papers?.length ?? 0} {(researchRun.papers?.length ?? 0) === 1 ? 'paper' : 'papers'}</span></div><div>{isRunDone(researchRun.status) && <Button type="button" variant="outline" size="sm" className="research-secondary-button" onClick={() => setResultsOpen(true)}>Review findings</Button>}<Button type="button" variant="ghost" size="sm" className="research-banner-button" disabled={runLoading} onClick={() => void fetchRun(researchRun.run_id)}><RefreshCw size={13}/> Check status</Button></div></div>}
            <div className="research-list-toolbar">
              <span>{countText}</span>
              <select className="research-sort" aria-label="Sort papers" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
            <div className="research-paper-list">
              {loading && papers.length === 0
                ? Array.from({ length: 6 }, (_, i) => <div className="research-skeleton-row" key={i} aria-hidden="true"><span className="research-skeleton research-skeleton--icon"/><span className="research-skeleton-lines"><span className="research-skeleton research-skeleton--title"/><span className="research-skeleton research-skeleton--meta"/></span></div>)
                : filtered.map(p => {
                  const shown = p.tags.slice(0, 2)
                  const extra = p.tags.length - shown.length
                  return <button key={p.id} type="button" className="research-paper-row" onClick={() => openPaper(p.id)}>
                    <span className="research-paper-icon"><BookText size={18} strokeWidth={1.5}/></span>
                    <span className="research-paper-row-details">
                      <strong>{p.title}</strong>
                      <small>{p.authors} <span>·</span> {p.year}{p.collection && <><span>·</span> {p.collection}</>}</small>
                    </span>
                    <span className="research-paper-tags">{shown.map(t => <i key={t}>{t}</i>)}{extra > 0 && <i className="research-paper-tags-more">+{extra}</i>}</span>
                    <ArrowRight size={16} className="research-action-arrow"/>
                  </button>
                })}
              {!loading && filtered.length === 0 && !libraryError && <div className="research-empty-list">{papers.length === 0 ? 'Your library is empty. Add a paper or start a new research.' : 'No matching papers among those loaded.'}<button type="button" onClick={() => { chooseView('all'); setSearch('') }}>Show all papers</button></div>}
              {hasMore && !search.trim() && <div className="research-api-pagination"><Button type="button" variant="outline" className="research-secondary-button" disabled={loadingMore || loading} onClick={() => void loadPapers(papers.length)}>{loadingMore ? 'Loading…' : 'Load more papers'}</Button></div>}
            </div>
          </div>}
        </section>

        {showAgent && <aside className={agentOpen ? 'research-companion research-surface' : 'research-companion research-companion--collapsed research-surface'} aria-label="Research Agent">
          {agentOpen ? <>
          <div className="research-companion-heading"><span className="research-ai-mark"><Sparkles size={18} strokeWidth={1.5}/></span><div><h2>Research Agent</h2><p>Powered by Athena</p></div><Button type="button" variant="ghost" size="icon" className="research-agent-toggle" aria-label="Collapse Research Agent" title="Collapse" onClick={() => setAgentOpen(false)}><PanelRightClose size={18}/></Button></div>
          <div className="research-action-list">
            {agentActions.map(({ key, icon: Icon, subtitle }) => <button key={key} className="research-agent-action" type="button" onClick={() => chooseAction(key)}><span className="research-agent-icon"><Icon size={16} strokeWidth={1.65}/></span><span><strong>{actionInfo[key].label}</strong><small>{subtitle}</small></span><ArrowRight size={15} className="research-action-arrow"/></button>)}
          </div>
          <Separator className="research-rule" />
          {selected && <div className="research-paper-details"><span className="research-aside-eyebrow">PAPER DETAILS</span><div><FileText size={16}/><span>{selected.year || '—'} publication year</span></div><div><Folder size={16}/><span>{selected.collection || 'No collection'}</span></div></div>}
          </> : <button type="button" className="research-agent-rail" aria-label="Expand Research Agent" title="Expand Research Agent" onClick={() => setAgentOpen(true)}><PanelRightOpen size={18}/><span className="research-ai-mark"><Sparkles size={16} strokeWidth={1.5}/></span><span className="research-agent-rail-label">Research Agent</span></button>}
        </aside>}
      </main>

      <footer className="research-footer"><span>OLYMPUS / ATHENA</span><span>Research, in harmony.</span><button type="button" onClick={onBack}><ArrowLeft size={14}/> Return to Olympus</button></footer>

      <ResearchResultsModal
        open={resultsOpen}
        onOpenChange={setResultsOpen}
        run={researchRun}
        userId={activeUserId}
        collections={collections}
        savedPaperIds={new Set(Object.keys(preferences).filter(id => preferences[id]?.saved))}
        paperCollections={Object.fromEntries(Object.entries(preferences).map(([id, pref]) => [id, pref.collection ?? '']))}
        onToggleSave={(id, saved) => updatePaper(String(id), { saved })}
        onSaveToCollection={(id, collection) => updatePaper(String(id), { saved: true, collection })}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="research-dialog">
          <DialogHeader><div className="research-dialog-icon"><Plus size={21}/></div><DialogTitle>Add paper</DialogTitle><DialogDescription>Save a paper to your FastAPI database. Your current API requires its OpenAlex ID and title.</DialogDescription></DialogHeader>
          <form className="research-form" onSubmit={e => void addPaper(e)}>
            <div className="research-field"><label htmlFor="api-paper-title">Paper title</label><Input id="api-paper-title" required maxLength={2000} value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="Paper title"/></div>
            <div className="research-field"><label htmlFor="api-openalex">OpenAlex ID</label><Input id="api-openalex" required maxLength={255} value={addOpenAlex} onChange={e => setAddOpenAlex(e.target.value)} placeholder="https://openalex.org/W..."/></div>
            <div className="research-field"><label htmlFor="api-doi">DOI (optional)</label><Input id="api-doi" value={addDoi} onChange={e => setAddDoi(e.target.value)} placeholder="10.1234/example"/></div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" disabled={adding || !addTitle.trim() || !addOpenAlex.trim()}>{adding ? 'Saving…' : 'Save paper'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={researchOpen} onOpenChange={setResearchOpen}>
        <DialogContent className="research-dialog">
          <DialogHeader><div className="research-dialog-icon"><Search size={21}/></div><DialogTitle>New research</DialogTitle><DialogDescription>Describe a topic and Athena will discover relevant papers and save them to your library.</DialogDescription></DialogHeader>
          <form className="research-form" onSubmit={e => void launchResearch(e)}>
            <div className="research-field">
              <label htmlFor="api-research-topic">Research topic</label>
              <textarea id="api-research-topic" className="research-dialog-textarea" required rows={4} value={researchPrompt} onChange={e => setResearchPrompt(e.target.value)} placeholder="e.g. Recent retrieval-augmented generation architectures"/>
            </div>
            <div className="research-form-row">
              <div className="research-field">
                <label htmlFor="api-research-user">Backend user ID</label>
                <Input id="api-research-user" type="number" min="1" required value={researchUserId} onChange={e => setResearchUserId(e.target.value)} placeholder="e.g. 1"/>
              </div>
              <div className="research-field">
                <label htmlFor="api-paper-count">Papers (1–30)</label>
                <Input id="api-paper-count" type="number" min="1" max="30" value={paperCount} onChange={e => setPaperCount(Number(e.target.value))}/>
              </div>
            </div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setResearchOpen(false)}>Cancel</Button><Button type="submit" disabled={startingResearch || !researchPrompt.trim() || !researchUserId || paperCount < 1 || paperCount > 30}>{startingResearch ? 'Starting…' : 'Start research'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newCollectionOpen} onOpenChange={open => { setNewCollectionOpen(open); if (!open) setNewCollectionName('') }}>
        <DialogContent className="research-dialog"><DialogHeader><div className="research-dialog-icon"><FolderPlus size={21}/></div><DialogTitle>New collection</DialogTitle><DialogDescription>Organize papers locally. Your API does not yet provide collection persistence.</DialogDescription></DialogHeader>
          <form className="research-form" onSubmit={createCollection}>
            <div className="research-field"><label htmlFor="new-collection-name">Collection name</label><Input id="new-collection-name" autoFocus value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} placeholder="e.g. Reinforcement Learning" required /></div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setNewCollectionOpen(false)}>Cancel</Button><Button type="submit" disabled={!newCollectionName.trim()}><Plus size={15}/> Create collection</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={action !== null} onOpenChange={open => { if (!open) setAction(null) }}>
        <DialogContent className="research-dialog"><DialogHeader><div className="research-dialog-icon"><Sparkles size={21}/></div><DialogTitle>{action ? actionInfo[action].label : ''}</DialogTitle><DialogDescription>{action ? actionInfo[action].description : ''} {action !== 'collection' && 'This action has no corresponding backend endpoint yet. You can copy its instruction.'}</DialogDescription></DialogHeader>
          {action === 'collection' ? <div className="research-action-form"><label htmlFor="collection-name">Collection</label><Input id="collection-name" value={draftCollection} onChange={e => setDraftCollection(e.target.value)} placeholder="Collection name"/><div className="research-collection-suggestions">{collections.map(c => <button key={c} className={draftCollection === c ? 'is-active' : ''} type="button" onClick={() => setDraftCollection(c)}><Folder size={13}/>{c}</button>)}</div><DialogFooter><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button onClick={saveCollection} disabled={!draftCollection.trim()}>Save to collection</Button></DialogFooter></div> : action ? <div className="research-action-form">
            {action === 'ask' && <><label htmlFor="ask-question">Your question</label><textarea className="research-dialog-textarea" id="ask-question" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What assumptions does this method make?"/></>}
            {action === 'compare' && <><label htmlFor="compare-paper">Compare with</label><select id="compare-paper" className="research-dialog-select" value={compared?.id ?? ''} onChange={e => setCompareId(e.target.value)}>{otherPapers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></>}
            <div className="research-instruction-label">INSTRUCTION PREVIEW <span>Copy to use with Athena when connected</span></div><div className="research-instruction-preview">{actionPrompt()}</div>
            <DialogFooter><Button variant="ghost" onClick={() => setAction(null)}>Close</Button><Button disabled={action === 'compare' && !compared} onClick={() => void copyText(actionPrompt(), 'Agent instruction copied.') }><Copy size={15}/> Copy instruction</Button></DialogFooter>
          </div> : null}
        </DialogContent>
      </Dialog>

      <div className="research-toast-stack">
        {doneToast && <div className="research-toast" role="status">
          <Sparkles size={15}/>Research #{doneToast.runId} is ready.
          <button type="button" className="research-toast-action" onClick={() => { setResultsOpen(true); setDoneToast(null) }}>View results <ArrowRight size={13}/></button>
          <button type="button" onClick={() => setDoneToast(null)} aria-label="Dismiss"><X size={13}/></button>
        </div>}
        {notification && <div className="research-toast" role="status"><Check size={15}/>{notification}<button type="button" onClick={() => setNotification('')} aria-label="Dismiss"><X size={13}/></button></div>}
      </div>
    </div>
  )
}