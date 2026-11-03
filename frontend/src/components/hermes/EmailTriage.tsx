import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Undo2, Check } from 'lucide-react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import type { ActionLog, EmailAction, EmailScope, EmailWindow, ProcessResult } from '../../api/hermesApi'
import { useEmailMatches } from './useEmailMatches'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const SCOPES: { value: EmailScope; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'jobs', label: 'Job offers & recruiters' },
  { value: 'business', label: 'Business (invoices, contracts, meetings)' },
  { value: 'security', label: 'Security & verification' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'important', label: 'Marked important by Gmail' },
  { value: 'all', label: 'Whole inbox' },
]
const WINDOWS: { value: EmailWindow; label: string }[] = [
  { value: 'any', label: 'Any time' }, { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' },
]
const scopeLabel = (value: EmailScope) => SCOPES.find(s => s.value === value)!.label.toLowerCase()

const ACTION_TEXT: Record<EmailAction, string> = {
  KEEP: 'leave it in the inbox',
  TRASH: 'move it to Trash',
  SPAM: 'move it to Spam',
  LABEL_PRIORITY: 'label it as priority',
  NEEDS_REVIEW: 'leave it untouched for your review',
}
const CHANGES: EmailAction[] = ['TRASH', 'SPAM', 'LABEL_PRIORITY']
const UNDOABLE: EmailAction[] = ['TRASH', 'SPAM']

function outcome(r: ProcessResult): string {
  if (r.error) return `Could not apply: ${r.error}`
  if (r.dry_run) return `Preview: Hermes would ${ACTION_TEXT[r.action]}. Nothing has changed.`
  return r.executed ? `Done: Hermes did ${ACTION_TEXT[r.action]}.` : `Hermes chose to ${ACTION_TEXT[r.action]}.`
}

export default function EmailTriage() {
  const [scope, setScope] = useState<EmailScope>('unread')
  const [window, setWindow] = useState<EmailWindow>('any')
  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ActionLog[]>([])

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const { items } = await hermesApi.actions({ status: 'applied', limit: 20 }, signal)
      setHistory(items.filter(r => CHANGES.includes(r.action)).slice(0, 5))
    } catch { /* history is secondary; errors surface on the main actions */ }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadHistory(controller.signal)
    return () => controller.abort()
  }, [loadHistory])

  const find = { scope, window, search: keyword }

  // The list follows the filters automatically; there is no separate "search" step.
  const { matches, loading: finding, error: listError } = useEmailMatches(find)

  async function preview(messageId?: string) {
    setBusy('preview'); setBusyId(messageId ?? null); setError(null); setResult(null)
    try {
      setResult(await hermesApi.processEmail({ ...find, message_id: messageId, dry_run: true }))
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null); setBusyId(null)
    }
  }

  async function apply() {
    if (!result) return
    setBusy('apply'); setError(null)
    try {
      setResult(await hermesApi.processEmail({ message_id: result.message_id, dry_run: false }))
      await loadHistory()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  async function undo(item: ActionLog) {
    setError(null)
    try {
      await hermesApi.undoAction(item.id)
      await loadHistory()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  // The result sits above a long list, so bring it into view once it arrives.
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [result])

  const canApply = result?.dry_run && !result.error && CHANGES.includes(result.action)

  return (
    <section className="triage" aria-labelledby="triage-title">
      <div className="sheet-row"><span id="triage-title" className="label">Triage an email</span></div>
      <p className="protected-hint">
        Preview shows what Hermes would do with one email. Nothing changes until you press Apply, and Trash or Spam can be undone.
      </p>

      <div className="triage-filters">
        <select className="select" aria-label="Which emails" value={scope} disabled={busy !== null}
          onChange={e => { setScope(e.target.value as EmailScope); setResult(null) }}>
          {SCOPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select" aria-label="How recent" value={window} disabled={busy !== null}
          onChange={e => { setWindow(e.target.value as EmailWindow); setResult(null) }}>
          {WINDOWS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Input aria-label="Keyword (optional)" placeholder="Keyword (optional), e.g. engineer" value={keyword} maxLength={100}
          disabled={busy !== null} onChange={e => setKeyword(e.target.value)} />
      </div>
      <div className="triage-buttons">
        <Button size="sm" variant="outline" onClick={() => void preview()} disabled={busy !== null}>
          <Eye size={13} aria-hidden="true" /> {busy === 'preview' ? 'Thinking…' : 'Preview newest'}
        </Button>
      </div>

      {(error || listError) && <p className="protected-error" role="alert">{error ?? listError}</p>}

      {result && (
        <div className="triage-result" role="status" ref={resultRef}>
          <p className="triage-subject">{result.subject || '(no subject)'}</p>
          <p className="triage-sender">{result.sender}</p>
          <div className="triage-tags">
            <span className="tag">{result.category}</span>
            <span className="tag tag--plain">Priority {result.priority}</span>
            <span className="tag tag--plain">{Math.round(result.confidence * 100)}% sure</span>
          </div>
          <p className="triage-reason">{result.reason}</p>
          <p className="triage-outcome">{outcome(result)}</p>
          {canApply && (
            <Button size="sm" onClick={() => void apply()} disabled={busy !== null}>
              <Check size={13} aria-hidden="true" /> {busy === 'apply' ? 'Applying…' : `Apply: ${ACTION_TEXT[result.action]}`}
            </Button>
          )}
        </div>
      )}

      {(matches || finding) && (
        <div aria-busy={finding}>
          <span className="label">{finding ? 'Searching…' : matches?.length ? `Newest ${matches.length} in ${scopeLabel(scope)}` : 'No matching emails'}</span>
          <ul className="protected-list">
            {(matches ?? []).map(m => (
              <li key={m.id} className="protected-row">
                <span className="triage-history">
                  <span className="triage-history-subject">{m.unread && <i className="triage-unread" aria-label="Unread" />}{m.subject || '(no subject)'}</span>
                  <span className="triage-sender">{m.sender}</span>
                  {m.snippet && <span className="triage-snippet">{m.snippet}</span>}
                </span>
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void preview(m.id)}>
                  <Eye size={13} aria-hidden="true" /> {busyId === m.id ? 'Thinking…' : 'Preview'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}


      {history.length > 0 && (
        <div>
          <span className="label">Recent changes</span>
          <ul className="protected-list">
            {history.map(item => (
              <li key={item.id} className="protected-row">
                <span className="triage-history">
                  <span className="triage-history-subject">{item.subject || '(no subject)'}</span>
                  <span className="triage-sender">{item.undone_at ? 'Undone' : item.action === 'TRASH' ? 'Moved to Trash' : item.action === 'SPAM' ? 'Moved to Spam' : 'Labelled priority'}</span>
                </span>
                {!item.undone_at && UNDOABLE.includes(item.action) && (
                  <Button variant="outline" size="sm" onClick={() => void undo(item)}><Undo2 size={13} aria-hidden="true" /> Undo</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
