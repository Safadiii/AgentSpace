import { useState } from 'react'
import { ExternalLink, PenLine, RefreshCw, Search } from 'lucide-react'
import type { EmailWindow } from '../../api/hermesApi'
import { relativeTime } from '../../lib/format'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import DraftPanel from './DraftPanel'
import { useEmailMatches } from './useEmailMatches'

const WINDOWS: { value: EmailWindow; label: string }[] = [
  { value: 'any', label: 'Any time' }, { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' },
]

/** "Name <a@b.com>" -> "Name" (falls back to the address). */
const senderName = (sender: string) => sender.replace(/<[^>]*>/, '').replace(/["']/g, '').trim() || sender

function when(date: string | null): string {
  const parsed = date ? new Date(date) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? relativeTime(parsed.toISOString()) : ''
}

export default function ImportantEmails({ account }: { account: string | null }) {
  const [recency, setRecency] = useState<EmailWindow>('7d')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [drafting, setDrafting] = useState<string | null>(null)   // id of the email whose draft panel is open
  const { matches, loading, error, reload } = useEmailMatches({ scope: 'important', window: recency, search: keyword }, 25)

  const rows = (matches ?? []).filter(m => !unreadOnly || m.unread)
  // authuser makes Gmail open the right account when several are signed in.
  const gmailLink = (id: string) => `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : ''}#all/${id}`

  return (
    <section className="important" aria-label="Important emails">
      <div className="important-filters">
        <div className="research-global-search history-search">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <Input aria-label="Search important emails" value={keyword} maxLength={100} onChange={e => setKeyword(e.target.value)}
            placeholder="Search important emails" className="research-search-input" />
        </div>
        <select className="select" aria-label="How recent" value={recency} onChange={e => setRecency(e.target.value as EmailWindow)}>
          {WINDOWS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="important-toggle">
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> Unread only
        </label>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading} aria-label="Refresh">
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </div>

      {error && <p className="protected-error" role="alert">{error}</p>}

      <p className="history-count" aria-live="polite">
        {loading ? 'Loading…' : `${rows.length} important ${rows.length === 1 ? 'email' : 'emails'}`}
      </p>

      {!loading && !error && rows.length === 0 && (
        <p className="protected-empty">Nothing important in this period. Gmail marks mail important from people you write to often and messages it thinks matter.</p>
      )}

      <ul className="history-list" aria-busy={loading}>
        {rows.map(m => (
          <li key={m.id} className="history-row">
            <div className="history-main">
              <p className="history-subject">{m.unread && <i className="triage-unread" aria-label="Unread" />}{m.subject || '(no subject)'}</p>
              <p className="history-sender">{senderName(m.sender)}{when(m.date) && ` · ${when(m.date)}`}</p>
              {m.snippet && <p className="history-reason">{m.snippet}</p>}
            </div>
            <div className="important-actions">
              <Button variant="outline" size="sm" aria-expanded={drafting === m.id}
                onClick={() => setDrafting(drafting === m.id ? null : m.id)}>
                <PenLine size={13} aria-hidden="true" /> Draft reply
              </Button>
              <a className="btn btn--ghost btn--sm" href={gmailLink(m.id)} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} aria-hidden="true" /> Open in Gmail
              </a>
            </div>
            {drafting === m.id && <DraftPanel email={m} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
