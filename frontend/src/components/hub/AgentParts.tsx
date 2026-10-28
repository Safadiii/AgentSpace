import { ArrowUpRight, Check } from 'lucide-react'
import { motion } from 'motion/react'
import { SPRING } from '../../lib/motion'
import { relativeTime, statusText } from '../../lib/format'
import type { ActivityEvent, Agent, AgentId, AgentTask } from '../../types'
import { agentHint, agentIcons } from './agentMeta'

export function StatusLabel({ status }: { status: Agent['status'] }) {
  return <span className="status"><i className={`dot dot--${status}`} aria-hidden="true" />{statusText[status]}</span>
}

function Glyph({ id }: { id: AgentId }) {
  const Icon = agentIcons[id]
  return <span className="glyph" aria-hidden="true"><Icon size={16} strokeWidth={1.6} /></span>
}

/** Stage list item: a quiet row, not a card, because it already lives inside the stage panel. */
export function AgentNode({ agent, task, onOpen }: { agent: Agent; task?: AgentTask; onOpen: (id: AgentId) => void }) {
  return (
    <button type="button" className="node" onClick={() => onOpen(agent.id)} aria-label={`Open ${agent.name}, ${statusText[agent.status]}`}>
      <Glyph id={agent.id} />
      <span className="node-text"><b>{agent.name}</b><small>{task?.title ?? agentHint[agent.id]}</small></span>
      <i className={`dot dot--${agent.status}`} aria-hidden="true" />
    </button>
  )
}

export function AgentRow({ agent, task, onOpen }: { agent: Agent; task?: AgentTask; onOpen: (id: AgentId) => void }) {
  return (
    <button type="button" className="agent-row" onClick={() => onOpen(agent.id)}>
      <Glyph id={agent.id} />
      <span className="agent-row-name"><b>{agent.name}</b><small>{agent.role}</small></span>
      <span className="agent-row-task">{task?.title ?? (agent.id === 'zeus' ? 'Overseeing the pantheon' : 'No active directive')}</span>
      <StatusLabel status={agent.status} />
      <ArrowUpRight className="agent-row-arrow" size={16} aria-hidden="true" />
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
