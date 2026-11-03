/** FastAPI Hermes contract (email agent). */
const BASE = (import.meta.env.VITE_HERMES_API_BASE || '/hermes').replace(/\/$/, '')

export interface ProtectedSender {
  id: number
  value: string // "boss@co.com" (exact address) or "co.com" (whole domain)
  created_at: string
}

export type EmailCategory = 'PRIORITY' | 'NORMAL' | 'ADVERTISEMENT' | 'SCAM'
export type EmailAction = 'KEEP' | 'LABEL_PRIORITY' | 'TRASH' | 'SPAM' | 'NEEDS_REVIEW'
export type EmailScope = 'unread' | 'promotions' | 'jobs' | 'business' | 'security' | 'important' | 'all'
export type EmailWindow = 'any' | '1d' | '7d' | '30d'

/** Which emails to look at. The server turns this into a Gmail search; no raw queries. */
export interface EmailSearch {
  scope: EmailScope
  window: EmailWindow
  search?: string
}

export interface EmailSummary {
  id: string
  sender: string
  subject: string
  snippet: string
  date: string | null
  unread: boolean
}

export interface ProcessResult {
  audit_id: number | null
  message_id: string
  sender: string
  subject: string
  category: EmailCategory
  priority: number
  confidence: number
  reason: string
  action: EmailAction
  dry_run: boolean
  executed: boolean
  error: string | null
}

export interface ActionLog {
  id: number
  message_id: string
  sender: string
  subject: string
  category: EmailCategory
  priority: number
  confidence: number
  reason: string
  action: EmailAction
  dry_run: boolean
  executed: boolean
  error: string | null
  created_at: string
  undone_at: string | null
}

export type ActionStatus = 'applied' | 'preview' | 'undone' | 'failed'

export interface ActionFilters {
  category?: EmailCategory
  action?: EmailAction
  status?: ActionStatus
  q?: string
  limit?: number
  offset?: number
}

export interface ActionPage {
  items: ActionLog[]
  total: number
}

export type DraftTone = 'professional' | 'friendly' | 'brief'

export interface Draft {
  to: string
  subject: string
  body: string
}

export interface Meeting {
  id: string
  title: string
  start: string // ISO timestamp, or a plain date for all-day events
  end: string | null
  all_day: boolean
  location: string | null
  link: string | null
}

export interface MeetingsResponse {
  connected: boolean
  problem: string | null
  meetings: Meeting[]
}

export interface GmailStatus {
  connected: boolean
  email: string | null
  problem: string | null
}

/** API failure with the backend's stable `code` (e.g. "gmail_auth"). */
export class HermesError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message)
  }
}

const OFFLINE = 'Hermes API is unreachable. Start the backend to use Hermes.'
const RELOGIN = 'Hermes lost access to Gmail. In the project folder run: python -m scripts.gmail_auth, approve the login, then try again.'

/** Turn any thrown value into one sentence a person can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof TypeError) return OFFLINE
  if (err instanceof HermesError) return err.code === 'gmail_auth' ? RELOGIN : err.message
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export const needsRelogin = (err: unknown) => err instanceof HermesError && err.code === 'gmail_auth'

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const { message, code } = detail as { message: string; code?: string }
      throw new HermesError(message, code ?? null)
    }
    throw new HermesError(typeof detail === 'string' ? detail : `Hermes API error (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}

export const hermesApi = {
  protectedSenders: (signal?: AbortSignal) => call<ProtectedSender[]>('/protected-senders', { signal }),
  protectSender: (value: string) =>
    call<ProtectedSender>('/protected-senders', { method: 'POST', body: JSON.stringify({ value }) }),
  emails: (find: EmailSearch, limit = 10, signal?: AbortSignal) => {
    const params = new URLSearchParams({ scope: find.scope, window: find.window, limit: String(limit) })
    if (find.search?.trim()) params.set('search', find.search.trim())
    return call<EmailSummary[]>(`/emails?${params}`, { signal })
  },
  draftReply: (messageId: string, body: { tone: DraftTone; notes?: string }) =>
    call<Draft>(`/emails/${encodeURIComponent(messageId)}/draft`, { method: 'POST', body: JSON.stringify(body) }),
  meetings: (signal?: AbortSignal) => call<MeetingsResponse>('/meetings?limit=5', { signal }),
  processEmail: (body: Partial<EmailSearch> & { message_id?: string; dry_run: boolean }) =>
    call<ProcessResult>('/email/process', { method: 'POST', body: JSON.stringify(body) }),
  status: (signal?: AbortSignal) => call<GmailStatus>('/status', { signal }),
  actions: (filters: ActionFilters = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value))
    return call<ActionPage>(`/actions?${params}`, { signal })
  },
  undoAction: (id: number) => call<ActionLog>(`/actions/${id}/undo`, { method: 'POST' }),
  unprotectSender: (id: number) => call<void>(`/protected-senders/${id}`, { method: 'DELETE' }),
}
