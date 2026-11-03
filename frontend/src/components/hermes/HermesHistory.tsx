import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Undo2 } from 'lucide-react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import type { ActionFilters, ActionLog, ActionStatus, EmailAction, EmailCategory } from '../../api/hermesApi'
import { relativeTime } from '../../lib/format'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const PAGE = 20
const UNDOABLE: EmailAction[] = ['TRASH', 'SPAM']
const ACTION_LABEL: Record<EmailAction, string> = {
  KEEP: 'Kept', LABEL_PRIORITY: 'Labelled priority', TRASH: 'Trash', SPAM: 'Spam', NEEDS_REVIEW: 'Needs review',
}
const CATEGORIES: EmailCategory[] = ['PRIORITY', 'NORMAL', 'ADVERTISEMENT', 'SCAM']
const ACTIONS: EmailAction[] = ['TRASH', 'SPAM', 'LABEL_PRIORITY', 'KEEP', 'NEEDS_REVIEW']
const STATUSES: { value: ActionStatus; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'preview', label: 'Preview only' },
  { value: 'undone', label: 'Undone' },
  { value: 'failed', label: 'Failed' },
]

function outcome(item: ActionLog): string {
  if (item.error) return 'Failed'
  if (item.undone_at) return 'Undone'
  if (item.dry_run) return 'Preview'
  return item.executed ? 'Applied' : 'Not applied'
}

export default function HermesHistory() {
  const [category, setCategory] = useState<EmailCategory | ''>('')
  const [action, setAction] = useState<EmailAction | ''>('')
  const [status, setStatus] = useState<ActionStatus | ''>('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')   // debounced copy of `search`
  const [items, setItems] = useState<ActionLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300)
    return () => window.clearTimeout(id)
  }, [search])

  const filters = useCallback((offset: number): ActionFilters => ({
    category: category || undefined, action: action || undefined, status: status || undefined,
    q: q || undefined, limit: PAGE, offset,
  }), [category, action, status, q])

  // Any filter change restarts the list; a stale response must never overwrite a newer one.
  const reload = useCallback(async () => {
    const ticket = ++request.current
    setLoading(true)
    try {
      const page = await hermesApi.actions(filters(0))
      if (ticket !== request.current) return
      setItems(page.items); setTotal(page.total); setError(null)
    } catch (err) {
      if (ticket === request.current) setError(friendlyError(err))
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => { void reload() }, [reload])

  async function loadMore() {
    const ticket = request.current
    setLoading(true)
    try {
      const page = await hermesApi.actions(filters(items.length))
      if (ticket !== request.current) return
      setItems(current => [...current, ...page.items]); setTotal(page.total); setError(null)
    } catch (err) {
      if (ticket === request.current) setError(friendlyError(err))
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }

  async function undo(item: ActionLog) {
    try {
      const updated = await hermesApi.undoAction(item.id)
      setItems(current => current.map(row => (row.id === updated.id ? updated : row)))
      setError(null)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const filtered = Boolean(category || action || status || q)
  const clear = () => { setCategory(''); setAction(''); setStatus(''); setSearch(''); setQ('') }

  return (
    <section className="history" aria-label="Hermes history">
      <div className="history-filters">
        <div className="research-global-search history-search">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <Input aria-label="Search subject or sender" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search subject or sender" className="research-search-input" />
        </div>
        <select className="select" aria-label="Category" value={category} onChange={e => setCategory(e.target.value as EmailCategory | '')}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
        </select>
        <select className="select" aria-label="Action" value={action} onChange={e => setAction(e.target.value as EmailAction | '')}>
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </select>
        <select className="select" aria-label="Outcome" value={status} onChange={e => setStatus(e.target.value as ActionStatus | '')}>
          <option value="">Any outcome</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {error && <p className="protected-error" role="alert">{error}</p>}

      <p className="history-count" aria-live="polite">
        {loading && items.length === 0 ? 'Loading…' : `Showing ${items.length} of ${total}`}
        {filtered && <> · <button type="button" className="history-clear" onClick={clear}>Clear filters</button></>}
      </p>

      {!loading && items.length === 0 && !error && (
        <p className="protected-empty">{filtered ? 'Nothing matches these filters.' : 'Hermes has not looked at any email yet. Try a Preview in Triage.'}</p>
      )}

      <ul className="history-list">
        {items.map(item => (
          <li key={item.id} className="history-row">
            <div className="history-main">
              <p className="history-subject">{item.subject || '(no subject)'}</p>
              <p className="history-sender">{item.sender} · {relativeTime(item.created_at)}</p>
              <p className="history-reason">{item.error ? `Error: ${item.error}` : item.reason}</p>
            </div>
            <div className="history-meta">
              <div className="triage-tags">
                <span className="tag">{item.category}</span>
                <span className="tag tag--plain">{ACTION_LABEL[item.action]}</span>
                <span className="tag tag--plain">{outcome(item)}</span>
              </div>
              {item.executed && !item.undone_at && UNDOABLE.includes(item.action) && (
                <Button variant="outline" size="sm" onClick={() => void undo(item)}><Undo2 size={13} aria-hidden="true" /> Undo</Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {items.length < total && (
        <Button variant="outline" size="sm" className="history-more" disabled={loading} onClick={() => void loadMore()}>
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  )
}
