/** FastAPI Hermes contract (email agent). */
const BASE = (import.meta.env.VITE_HERMES_API_BASE || '/hermes').replace(/\/$/, '')

export interface ProtectedSender {
  id: number
  value: string // "boss@co.com" (exact address) or "co.com" (whole domain)
  created_at: string
}

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
    throw new Error(typeof detail === 'string' ? detail : `Hermes API error (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
}

export const hermesApi = {
  protectedSenders: (signal?: AbortSignal) => call<ProtectedSender[]>('/protected-senders', { signal }),
  protectSender: (value: string) =>
    call<ProtectedSender>('/protected-senders', { method: 'POST', body: JSON.stringify({ value }) }),
  unprotectSender: (id: number) => call<void>(`/protected-senders/${id}`, { method: 'DELETE' }),
}
