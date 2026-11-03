import { useState } from 'react'
import { Check, ExternalLink, KeyRound, LogIn } from 'lucide-react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

const CLOUD = 'https://console.cloud.google.com'
const MAX_FILE_BYTES = 20_000

function Link({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={11} aria-hidden="true" /></a>
}

/** Step-by-step Gmail setup: save the user's Google key, then sign in. Replaces editing .env by hand. */
export default function ConnectGmail({ open, onOpenChange, hasKey, onKeySaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasKey: boolean
  onKeySaved: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'key' | 'login' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(false)
  const keyReady = hasKey && !replacing

  async function readFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) { setError('That file is too big to be a Google key. Download the JSON again.'); return }
    setError(null); setText(await file.text())
  }

  async function saveKey() {
    setBusy('key'); setError(null)
    try {
      await hermesApi.saveConnectKey(text)
      setText(''); setReplacing(false); onKeySaved()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  async function signIn() {
    setBusy('login'); setError(null)
    try {
      const { url } = await hermesApi.startConnect(window.location.origin)
      window.location.assign(url)   // Google sends the browser back to /messages when done
    } catch (err) {
      setError(friendlyError(err)); setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="wide" className="connect">
        <DialogHeader>
          <DialogTitle>Connect your Gmail</DialogTitle>
          <DialogDescription>
            One-time setup, about five minutes. Hermes gets a key from your own free Google account, so your mail never goes through anyone else.
            The key stays on this computer.
          </DialogDescription>
        </DialogHeader>

        <section className="connect-part">
          <h3><span className="connect-num">1</span> Get your Google key</h3>
          <ol className="connect-steps">
            <li><Link href={`${CLOUD}/projectcreate`}>Create a Google Cloud project</Link>. Any name works, then press Create.</li>
            <li><Link href={`${CLOUD}/apis/library/gmail.googleapis.com`}>Open the Gmail API page</Link> and press Enable.</li>
            <li>
              <Link href={`${CLOUD}/auth/overview`}>Set up the sign-in screen</Link>: press Get started, pick any app name, choose
              <b> External</b>, and enter your email. Then open <b>Audience</b> and add your own Gmail address under <b>Test users</b>.
            </li>
            <li>
              <Link href={`${CLOUD}/auth/clients`}>Create the key</Link>: press Create client, choose <b>Desktop app</b> as the type, press Create,
              then <b>Download JSON</b>.
            </li>
          </ol>
        </section>

        <section className="connect-part">
          <h3><span className="connect-num">2</span> Add your key</h3>
          {keyReady ? (
            <p className="connect-ok"><Check size={14} aria-hidden="true" /> Key saved.{' '}
              <button type="button" className="history-clear" onClick={() => setReplacing(true)}>Use a different key</button></p>
          ) : (
            <div className="connect-key">
              <label className="connect-file">
                <input type="file" accept=".json,application/json" onChange={e => void readFile(e.target.files?.[0])} />
              </label>
              <textarea className="connect-text" aria-label="Google key JSON" rows={4} spellCheck={false} value={text}
                placeholder="Choose the downloaded file above, or paste its contents here" onChange={e => setText(e.target.value)} />
              <div className="connect-row">
                <Button size="sm" onClick={() => void saveKey()} disabled={busy !== null || !text.trim()}>
                  <KeyRound size={13} aria-hidden="true" /> {busy === 'key' ? 'Saving…' : 'Save key'}
                </Button>
                {replacing && <Button size="sm" variant="ghost" onClick={() => { setReplacing(false); setText('') }}>Cancel</Button>}
              </div>
            </div>
          )}
        </section>

        <section className="connect-part">
          <h3><span className="connect-num">3</span> Sign in</h3>
          <p className="connect-note">
            Google will ask you to pick your account. If it says the app is not verified, press <b>Advanced</b>, then <b>Continue</b>: it is your own app.
            Tick the box that lets Hermes read and manage your Gmail, then press Continue.
          </p>
          <div className="connect-row">
            <Button size="sm" onClick={() => void signIn()} disabled={busy !== null || !keyReady}>
              <LogIn size={13} aria-hidden="true" /> {busy === 'login' ? 'Opening Google…' : 'Connect with Google'}
            </Button>
          </div>
          <p className="connect-note">Apps in test mode ask you to sign in again after 7 days. Just press Connect again then.</p>
        </section>

        {error && <p className="protected-error" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
