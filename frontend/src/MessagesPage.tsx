import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Inbox, Mail, RefreshCw, ShieldCheck, Star } from 'lucide-react'
import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import { hermesApi } from './api/hermesApi'
import type { GmailStatus } from './api/hermesApi'
import ConnectGmail from './components/hermes/ConnectGmail'
import EmailTriage from './components/hermes/EmailTriage'
import HermesHistory from './components/hermes/HermesHistory'
import ImportantEmails from './components/hermes/ImportantEmails'
import NextMeeting from './components/hermes/NextMeeting'
import ProtectedSenders from './components/hermes/ProtectedSenders'
import './css/research.css'
import './css/messages.css'

type View = 'triage' | 'important' | 'history' | 'protected'

const VIEWS: { id: View; label: string; icon: typeof Inbox; title: string; blurb: string }[] = [
  { id: 'triage', label: 'Triage', icon: Inbox, title: 'Triage an email',
    blurb: 'Hermes reads one email, decides what it is and what to do. Preview first; nothing changes until you press Apply.' },
  { id: 'important', label: 'Important', icon: Star, title: 'Important emails',
    blurb: 'The mail Gmail marks as important, newest first. Narrow it by time, keyword or unread.' },
  { id: 'history', label: 'History', icon: History, title: 'History',
    blurb: 'Everything Hermes has looked at, including previews. Filter it, and undo Trash or Spam.' },
  { id: 'protected', label: 'Protected senders', icon: ShieldCheck, title: 'Protected senders',
    blurb: 'Hermes never trashes or spams mail from these addresses or domains.' },
]

export default function MessagesPage() {
  const [view, setView] = useState<View>('triage')
  const [mobileNav, setMobileNav] = useState(false)
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const askedOnce = useRef(false)

  const check = useCallback(async (signal?: AbortSignal) => {
    setChecking(true)
    try {
      setGmail(await hermesApi.status(signal)); setOffline(false)
    } catch {
      if (!signal?.aborted) { setGmail(null); setOffline(true) }
    } finally {
      if (!signal?.aborted) setChecking(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void check(controller.signal)
    return () => controller.abort()
  }, [check])

  // Google sends the browser back here with the result of the sign-in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('gmail')
    if (!result) return
    setNotice(result === 'connected'
      ? { ok: true, text: 'Gmail connected. Hermes is ready.' }
      : { ok: false, text: params.get('reason')?.slice(0, 200) || 'Gmail could not be connected. Try again.' })
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // First visit with nothing set up: show the instructions without being asked.
  useEffect(() => {
    if (gmail && !gmail.connected && !gmail.has_credentials && !askedOnce.current) {
      askedOnce.current = true
      setConnectOpen(true)
    }
  }, [gmail])

  const current = VIEWS.find(v => v.id === view)!
  const dot = gmail?.connected ? '' : ' messages-dot--bad'

  return (
    <div className="research messages">
      <div className="research-layout">
        <aside className={`research-library research-surface ${mobileNav ? 'research-library--open' : ''}`} aria-label="Messages navigation">
          <div className="research-library-heading"><h2>Messages</h2></div>
          <nav className="research-nav" aria-label="Messages sections">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={view === id ? 'page' : undefined}
                className={view === id ? 'research-nav-row active' : 'research-nav-row'}
                onClick={() => { setView(id); setMobileNav(false) }}>
                <Icon size={17} aria-hidden="true" /> {label}
              </button>
            ))}
          </nav>
          <Separator className="research-rule" />
          <div className="research-library-bottom" title={gmail?.email ?? 'Gmail connection'}>
            <span className={`research-green-dot${dot}`} />
            <span className="messages-account">{gmail?.connected ? gmail.email : offline ? 'Backend offline' : gmail ? 'Gmail login needed' : 'Checking Gmail…'}</span>
            {gmail && <button type="button" className="history-clear" onClick={() => setConnectOpen(true)}>{gmail.connected ? 'Change' : 'Connect'}</button>}
          </div>
        </aside>

        <section className="research-content research-surface" aria-label={current.title}>
          <div className="research-list-header">
            <div>
              <span className="research-eyebrow">Hermes</span>
              <h1>{current.title}</h1>
            </div>
            <NextMeeting />
            <Button type="button" variant="ghost" size="sm" className="research-mobile-library-button" onClick={() => setMobileNav(v => !v)}>Sections</Button>
          </div>
          <p className="messages-blurb">{current.blurb}</p>

          {offline && (
            <div className="research-api-error" role="alert">
              <span>Hermes API is unreachable. Start the backend to use Hermes.</span>
              <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}><RefreshCw size={13} aria-hidden="true" /> Retry</Button>
            </div>
          )}
          {notice && (
            <div className={notice.ok ? 'messages-notice' : 'research-api-error'} role="status">
              <span>{notice.text}</span>
              <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>
            </div>
          )}
          {gmail && !gmail.connected && (
            <div className="research-api-error" role="alert">
              <span>{gmail.problem ?? 'Gmail is not connected.'}</span>
              <span className="messages-actions">
                <Button size="sm" onClick={() => setConnectOpen(true)}><Mail size={13} aria-hidden="true" /> Connect Gmail</Button>
                <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}><RefreshCw size={13} aria-hidden="true" /> Check again</Button>
              </span>
            </div>
          )}

          <div className="messages-body">
            {view === 'triage' && <EmailTriage />}
            {view === 'important' && <ImportantEmails account={gmail?.email ?? null} />}
            {view === 'history' && <HermesHistory />}
            {view === 'protected' && <ProtectedSenders />}
          </div>
        </section>
      </div>
      <ConnectGmail open={connectOpen} onOpenChange={setConnectOpen} hasKey={gmail?.has_credentials ?? false} onKeySaved={() => void check()} />
    </div>
  )
}
