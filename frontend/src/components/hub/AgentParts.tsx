import { ArrowUpRight, Check } from 'lucide-react'
import { motion } from 'motion/react'
import { SPRING } from '../../lib/motion'
import { relativeTime, statusText } from '../../lib/format'
import type { ActivityEvent, Agent, AgentId, AgentTask } from '../../types'
import { agentHint } from './agentMeta'

export function StatusLabel({ status }: { status: Agent['status'] }) {
  return <span className="status"><i className={`dot dot--${status}`} aria-hidden="true" />{statusText[status]}</span>
}

/** One agent: its emblem (drawn in dots behind it by DotField) beside its name, state and current work. */
export function GodRow({ agent, task, index, onOpen }: { agent: Agent; task?: AgentTask; index: number; onOpen: (id: AgentId) => void }) {
  return (
    <button type="button" className="god" onClick={() => onOpen(agent.id)} aria-label={`Open ${agent.name}, ${statusText[agent.status]}`}>
      <div className="god-anchor" data-god={agent.id} aria-hidden="true" />
      <div className="god-info">
        <span className="label">{String(index + 1).padStart(2, '0')} / {agentHint[agent.id]}</span>
        <b>{agent.name}</b>
        <p>{agent.description}</p>
        <span className="status"><i className={`dot dot--${agent.status}`} aria-hidden="true" />{statusText[agent.status]}{task ? ` · ${task.title}` : ''}</span>
        <span className="god-open">Open {agent.name} <ArrowUpRight size={14} aria-hidden="true" /></span>
      </div>
    </button>
  )
}

export function DirectiveItem({ task, agent, busy, onComplete }: { task: AgentTask; agent?: Agent; busy: boolean; onComplete: (id: string) => void }) {
  return (
    <motion.li className="directive" layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
      <div className="directive-text"><b>{task.title}</b><small>{agent?.name ?? 'AgentSpace'} · {relativeTime(task.created_at)}</small></div>
      <span className={`tag tag--${task.status}`}>{task.status}</span>
      {task.status === 'running'
        ? <button type="button" className="done-btn" disabled={busy} onClick={() => onComplete(task.id)} aria-label={`Mark "${task.title}" complete`} title="Mark complete"><Check size={15} aria-hidden="true" /></button>
        : <span className="done-btn done-btn--none" aria-hidden="true" />}
    </motion.li>
  )
}

export function ActivityItem({ event, agent }: { event: ActivityEvent; agent?: Agent }) {
  return (
    <motion.li className="activity" layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
      <i className={`dot dot--${agent?.status ?? 'idle'}`} aria-hidden="true" />
      <div><p>{event.message}</p><small>{relativeTime(event.created_at)}</small></div>
    </motion.li>
  )
}
