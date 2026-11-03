import { useEffect, useState } from 'react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import type { EmailSearch, EmailSummary } from '../../api/hermesApi'

/** Loads matching emails whenever the filters change. Typing is debounced; stale answers are dropped. */
export function useEmailMatches({ scope, window: recency, search }: EmailSearch, limit = 10) {
  const [matches, setMatches] = useState<EmailSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      hermesApi.emails({ scope, window: recency, search }, limit, controller.signal)
        .then(rows => { setMatches(rows); setError(null) })
        .catch(err => { if (!controller.signal.aborted) { setMatches(null); setError(friendlyError(err)) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search?.trim() ? 400 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [scope, recency, search, limit, tick])

  return { matches, loading, error, reload: () => setTick(t => t + 1) }
}
