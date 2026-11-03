import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, RefreshCw, Video } from 'lucide-react'
import { friendlyError, hermesApi } from '../../api/hermesApi'
import type { Meeting, MeetingsResponse } from '../../api/hermesApi'
import { Button } from '../ui/button'

const REFRESH_MS = 5 * 60_000

/** 3d 4h / 2h 15m / 12m 30s: the unit that matters at each distance. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

const startOf = (m: Meeting) => new Date(m.start).getTime()
const endOf = (m: Meeting) => new Date(m.end ?? m.start).getTime()
const clock = (m: Meeting) => new Date(m.start).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

export default function NextMeeting() {
  const [data, setData] = useState<MeetingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await hermesApi.meetings(signal)); setError(null)
    } catch (err) {
      if (!signal?.aborted) setError(friendlyError(err))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const refresh = setInterval(() => void load(), REFRESH_MS)
    return () => { controller.abort(); clearInterval(refresh) }
  }, [load])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // All-day entries (birthdays, holidays) have no countdown; only timed events count.
  const upcoming = (data?.meetings ?? []).filter(m => !m.all_day && endOf(m) > now)
  const [next, after] = upcoming
  const live = next && startOf(next) <= now

  if (error || (data && !data.connected)) {
    return (
      <div className="meeting meeting--note" role="status">
        <CalendarClock size={16} aria-hidden="true" />
        <div className="meeting-text">
          <strong>{error ? 'Meetings unavailable' : 'Connect Google Calendar'}</strong>
          <span>
            {error ?? data?.problem}{' '}
            {!error && !data?.problem?.includes('calendar_auth') && !data?.problem?.includes('not enabled') &&
              <>Run <code>python -m scripts.calendar_auth</code> in the project folder, then check again.</>}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={13} aria-hidden="true" /> Check again</Button>
      </div>
    )
  }

  if (!data) return <div className="meeting meeting--note" aria-busy="true"><CalendarClock size={16} aria-hidden="true" /><span>Checking your calendar…</span></div>

  if (!next) {
    return (
      <div className="meeting meeting--note" role="status">
        <CalendarClock size={16} aria-hidden="true" /><span>No meetings in the next two weeks.</span>
      </div>
    )
  }

  return (
    <div className={live ? 'meeting meeting--live' : 'meeting'} role="timer" aria-label={`Next meeting: ${next.title}`}>
      <CalendarClock size={16} aria-hidden="true" />
      <div className="meeting-text">
        <span className="meeting-label">{live ? 'In progress · ends in' : 'Next meeting in'}</span>
        <strong className="meeting-clock">{countdown((live ? endOf(next) : startOf(next)) - now)}</strong>
        <span className="meeting-title">{next.title} · {clock(next)}</span>
        {after && <span className="meeting-then">Then: {after.title} · {clock(after)}</span>}
      </div>
      {next.link && (
        <a className="btn btn--ghost btn--sm" href={next.link} target="_blank" rel="noopener noreferrer">
          <Video size={13} aria-hidden="true" /> {live ? 'Join' : 'Open'}
        </a>
      )}
    </div>
  )
}
