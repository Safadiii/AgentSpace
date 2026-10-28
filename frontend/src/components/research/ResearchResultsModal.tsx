import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Bookmark, Check, ChevronDown, Folder, RotateCcw, Sparkles, X } from 'lucide-react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { researchApi } from '../../api/researchApi'
import type { ResearchRunResponse } from '../../api/researchApi'
import '../../css/research.css'

// Impressions already sent to the API ("runId:paperId"), kept in this browser so reopening
// the modal or reloading the page never records the same impression twice.
const IMPRESSIONS_KEY = 'olympus:research-impressions:v1'
const IMPRESSION_SOURCE = 'athena_results_modal'

function readRecordedImpressions(): Set<string> {
  try {
    const raw = window.localStorage.getItem(IMPRESSIONS_KEY)
    const value: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  } catch { return new Set() }
}

function writeRecordedImpressions(keys: Set<string>) {
  try { window.localStorage.setItem(IMPRESSIONS_KEY, JSON.stringify([...keys].slice(-2000))) } catch { /* Storage may be disabled. */ }
}

type ResultPaper = NonNullable<ResearchRunResponse['papers']>[number] & {
  recommendation_item_id?: number | null
  relevance_score?: number | null
  explanation?: string | null
}

type ResultsRun = ResearchRunResponse & { query?: string | null }

export interface ResearchResultsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: ResultsRun | null
  collections: string[]
  savedPaperIds: Set<string>
  paperCollections: Record<string, string>
  onToggleSave: (paperId: number, save: boolean) => void
  onSaveToCollection: (paperId: number, collection: string) => void
}

function openAlexUrl(value: string): string | undefined {
  if (/^https:\/\/openalex\.org\/W\d+$/i.test(value)) return value
  if (/^W\d+$/i.test(value)) return `https://openalex.org/${value}`
  return undefined
}

export default function ResearchResultsModal({
  open,
  onOpenChange,
  run,
  collections,
  savedPaperIds,
  paperCollections,
  onToggleSave,
  onSaveToCollection,
}: ResearchResultsModalProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showDismissed, setShowDismissed] = useState(false)

  // Each research run begins with a fresh local review state.
  useEffect(() => {
    setDismissed(new Set())
    setExpanded(new Set())
    setShowDismissed(false)
  }, [run?.run_id])

  const papers = useMemo<ResultPaper[]>(
    () => [...(run?.papers ?? [])].sort((a, b) => a.rank - b.rank),
    [run?.papers],
  )
  const visiblePapers = papers.filter(paper => showDismissed || !dismissed.has(paper.id))
  const keptCount = papers.length - dismissed.size

  // Record an impression the first time each paper is actually on screen (at least half visible
  // inside the scrolling list), so papers below the fold aren't counted as seen until scrolled to.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const recordedRef = useRef<Set<string> | null>(null)
  const inflightRef = useRef(new Set<string>())
  const visibleKey = visiblePapers.map(paper => paper.id).join(',')

  useEffect(() => {
    if (!open || !scrollEl || !run) return
    if (recordedRef.current === null) recordedRef.current = readRecordedImpressions()
    const recorded = recordedRef.current
    const byId = new Map(papers.map(paper => [paper.id, paper]))

    async function recordImpression(paper: ResultPaper) {
      const key = `${run!.run_id}:${paper.id}`
      if (recorded.has(key) || inflightRef.current.has(key)) return
      inflightRef.current.add(key)
      try {
        await researchApi.interaction(paper.id, {
          action: 'IMPRESSION',
          source_agent: IMPRESSION_SOURCE,
          recommendation_item_id: paper.recommendation_item_id ?? null,
          interaction_metadata: {
            run_id: run!.run_id,
            rank: paper.rank,
            relevance_score: paper.relevance_score ?? null,
            surface: 'results_modal',
          },
        })
        recorded.add(key)
        writeRecordedImpressions(recorded)
      } catch {
        // Best effort: a failed impression is retried the next time the paper is shown.
      } finally { inflightRef.current.delete(key) }
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const paper = byId.get(Number((entry.target as HTMLElement).dataset.paperId))
        observer.unobserve(entry.target)
        if (paper) void recordImpression(paper)
      }
    }, { root: scrollEl, threshold: 0.5 })
    scrollEl.querySelectorAll('[data-paper-id]').forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [open, scrollEl, run?.run_id, visibleKey, papers])

  function toggleExpanded(id: number) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDismissed(id: number) {
    setDismissed(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="research-dialog research-results-dialog">
        <DialogHeader className="research-results-header">
          <div className="research-results-kicker"><Sparkles size={14} /> ATHENA · RESEARCH #{run?.run_id ?? '—'}</div>
          <DialogTitle>Athena's findings</DialogTitle>
          <DialogDescription>
            {run?.query ? `Research: ${run.query}` : 'Review the papers discovered in this research run.'}
          </DialogDescription>
          <div className="research-results-summary">
            <span>{papers.length} discovered</span>
            <span aria-hidden="true">·</span>
            <span>{keptCount} in review</span>
            {dismissed.size > 0 && <span className="research-results-dismissed-count">{dismissed.size} dismissed</span>}
          </div>
        </DialogHeader>

        <div className="research-results-toolbar">
          <span>RECOMMENDATIONS <span className="research-results-muted">· Ranked by Athena</span></span>
          {dismissed.size > 0 && (
            <button type="button" className="research-results-text-button" onClick={() => setShowDismissed(value => !value)}>
              {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
            </button>
          )}
        </div>

        <div className="research-results-scroll" ref={setScrollEl} aria-label="Research findings list">
          {papers.length === 0 && <div className="research-results-empty">This run contains no recommendations.</div>}
          {papers.length > 0 && visiblePapers.length === 0 && (
            <div className="research-results-empty">
              All recommendations are dismissed from this review.
              <button type="button" onClick={() => setShowDismissed(true)}>Review dismissed papers</button>
            </div>
          )}
          {visiblePapers.map(paper => {
            const isDismissed = dismissed.has(paper.id)
            const isSaved = savedPaperIds.has(String(paper.id))
            const abstractExpanded = expanded.has(paper.id)
            const sourceUrl = openAlexUrl(paper.openalex_id)
            return (
              <article key={paper.id} className={`research-results-paper${isDismissed ? ' research-results-paper--dismissed' : ''}`} data-paper-id={paper.id}>
                <span className="research-results-rank">{String(paper.rank).padStart(2, '0')}</span>
                <div className="research-results-paper-body">
                  <div className="research-results-paper-heading">
                    <h3>{paper.title}</h3>
                    {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${paper.title} on OpenAlex`} title="Open on OpenAlex"><ArrowUpRight size={16} /></a>}
                  </div>
                  <div className="research-results-paper-meta">
                    {paper.relevance_score != null && <span>Relevance score: {paper.relevance_score.toFixed(2)}</span>}
                    {paper.explanation && <span className="research-results-explanation">{paper.explanation}</span>}
                  </div>
                  {paper.abstract && (
                    <>
                      <p className={`research-results-abstract${abstractExpanded ? ' research-results-abstract--expanded' : ''}`}>{paper.abstract}</p>
                      <button type="button" className="research-results-expand" aria-expanded={abstractExpanded} onClick={() => toggleExpanded(paper.id)}>
                        {abstractExpanded ? 'Less abstract' : 'Read abstract'} <ChevronDown className={abstractExpanded ? 'research-results-chevron--up' : ''} size={13} />
                      </button>
                    </>
                  )}
                  <div className="research-results-row-actions">
                    <Button type="button" variant="outline" size="sm" className={`research-results-save${isSaved ? ' is-saved' : ''}`} onClick={() => onToggleSave(paper.id, !isSaved)} disabled={isDismissed}>
                      {isSaved ? <Check size={14} /> : <Bookmark size={14} />}
                      {isSaved ? 'Saved' : 'Save'}
                    </Button>
                    <label className="research-results-collection-wrap">
                      <Folder size={14} aria-hidden="true" />
                      <select
                        aria-label={`Save ${paper.title} to collection`}
                        value={paperCollections[String(paper.id)] ?? ''}
                        disabled={isDismissed || collections.length === 0}
                        onChange={event => {
                          if (event.target.value) onSaveToCollection(paper.id, event.target.value)
                        }}
                      >
                        <option value="">{collections.length ? 'Collection' : 'No collections'}</option>
                        {collections.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <button type="button" className="research-results-dismiss" onClick={() => toggleDismissed(paper.id)}>
                      {isDismissed ? <><RotateCcw size={14} /> Restore</> : <><X size={14} /> Dismiss</>}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div className="research-results-footer">
          <p>Dismiss only hides papers from this review; it doesn't delete them from the database. Saves and collections remain browser-local.</p>
          <Button className="research-primary-button" type="button" onClick={() => onOpenChange(false)}>
            Finish review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}