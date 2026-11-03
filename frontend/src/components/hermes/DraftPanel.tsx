import { useState } from 'react'
import { Check, Copy, Mail, Sparkles } from 'lucide-react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import type { Draft, DraftTone, EmailSummary } from '../../api/hermesApi'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const TONES: { value: DraftTone; label: string }[] = [
  { value: 'professional', label: 'Professional' }, { value: 'friendly', label: 'Friendly' }, { value: 'brief', label: 'Brief' },
]

/** "Sara Lee <sara@acme.com>" -> "sara@acme.com" */
const address = (to: string) => to.match(/<([^>]+)>/)?.[1] ?? to.trim()

/** Asks the AI for a reply draft. The text is only shown here: nothing is sent or saved to Gmail. */
export default function DraftPanel({ email }: { email: EmailSummary }) {
  const [tone, setTone] = useState<DraftTone>('professional')
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setBusy(true); setError(null); setCopied(false)
    try {
      const result = await hermesApi.draftReply(email.id, { tone, notes: notes.trim() || undefined })
      setDraft(result); setBody(result.body)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setError('Could not copy. Select the text and copy it yourself.') }
  }

  const mailto = draft && `mailto:${encodeURIComponent(address(draft.to))}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className="draft">
      <div className="draft-controls">
        <select className="select" aria-label="Tone" value={tone} disabled={busy} onChange={e => setTone(e.target.value as DraftTone)}>
          {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Input aria-label="What should the reply say? (optional)" placeholder="What should it say? (optional), e.g. accept and ask for Thursday"
          value={notes} maxLength={500} disabled={busy} onChange={e => setNotes(e.target.value)} />
        <Button size="sm" onClick={() => void generate()} disabled={busy}>
          <Sparkles size={13} aria-hidden="true" /> {busy ? 'Writing…' : draft ? 'Write again' : 'Write draft'}
        </Button>
      </div>
      {busy && <p className="protected-hint" role="status">The AI is writing. This can take up to a minute or two.</p>}
      {error && <p className="protected-error" role="alert">{error}</p>}
      {draft && !busy && (
        <div className="draft-result">
          <p className="triage-sender">To: {draft.to}</p>
          <p className="triage-sender">Subject: {draft.subject}</p>
          <textarea className="textarea" rows={9} aria-label="Draft reply" value={body} onChange={e => setBody(e.target.value)} />
          <div className="triage-buttons">
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <a className="btn btn--ghost btn--sm" href={mailto ?? undefined}><Mail size={13} aria-hidden="true" /> Open in mail app</a>
          </div>
          <p className="protected-hint">This is only a draft. Nothing has been sent. Review and edit it before you use it.</p>
        </div>
      )}
    </div>
  )
}
