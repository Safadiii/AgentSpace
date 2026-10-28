import type { AgentStatus } from '../types'

export const statusText: Record<AgentStatus, string> = {
  working: 'Working', available: 'Available', idle: 'Idle', paused: 'Paused',
}

export function relativeTime(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
