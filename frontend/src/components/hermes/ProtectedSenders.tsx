import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { hermesApi } from '../../api/hermesApi'
import type { ProtectedSender } from '../../api/hermesApi'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

const OFFLINE = 'Hermes API is unreachable. Start the backend to manage protected senders.'
const byValue = (a: ProtectedSender, b: ProtectedSender) => a.value.localeCompare(b.value)

export default function ProtectedSenders() {
  const [items, setItems] = useState<ProtectedSender[]>([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    hermesApi.protectedSenders(controller.signal)
      .then(rows => { setItems(rows); setError(null) })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof TypeError ? OFFLINE : err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(null)
    try {
      const created = await hermesApi.protectSender(value)
      setItems(current => [...current, created].sort(byValue))
      setValue('')
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: ProtectedSender) {
    setError(null)
    try {
      await hermesApi.unprotectSender(item.id)
      setItems(current => current.filter(x => x.id !== item.id))
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE : (err as Error).message)
    }
  }

  return (
    <section className="protected" aria-labelledby="protected-title">
      <div className="sheet-row">
        <span id="protected-title" className="label">Protected senders</span>
        <span className="label">{items.length}</span>
      </div>
      <p className="protected-hint">
        Hermes never trashes or spams these senders. Add an address to protect one person, or a domain to protect everyone at it.
      </p>

      <form className="protected-form" onSubmit={add}>
        <Input aria-label="Email address or domain" placeholder="name@company.com or company.com" autoComplete="off"
          spellCheck={false} value={value} onChange={e => setValue(e.target.value)} />
        <Button type="submit" size="sm" disabled={busy || !value.trim()}><Plus size={13} aria-hidden="true" /> Protect</Button>
      </form>

      {error && <p className="protected-error" role="alert">{error}</p>}

      {!loading && items.length === 0 && !error && <p className="protected-empty">No protected senders yet.</p>}
      {items.length > 0 && (
        <ul className="protected-list">
          {items.map(item => (
            <li key={item.id} className="protected-row">
              <span className="protected-value">{item.value}</span>
              <span className="tag tag--plain">{item.value.includes('@') ? 'Address' : 'Domain'}</span>
              <Button variant="ghost" size="icon" className="protected-remove" aria-label={`Stop protecting ${item.value}`} onClick={() => void remove(item)}>
                <X size={14} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
