import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, BookOpen, Pause, Play } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { useDragToDismiss } from '../../hooks/useDragToDismiss'
import type { Agent, AgentTask } from '../../types'
import { StatusLabel } from './AgentParts'

interface Props {
  agent: Agent | undefined
  task: AgentTask | undefined
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (title: string) => Promise<boolean>
  onToggle: () => void
  onOpenResearch: () => void
}

export default function AgentSheet({ agent, task, open, busy, onOpenChange, onSubmit, onToggle, onOpenResearch }: Props) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange])
  useDragToDismiss(popup, dismiss)
  if (!agent) return null
  const isZeus = agent.id === 'zeus'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await onSubmit(text)) setText('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" initialFocus={field} popupRef={setPopup}>
        <DialogTitle className="sheet-title">{agent.name}</DialogTitle>
        <DialogDescription>{agent.role}. {agent.description}</DialogDescription>

        <div className="sheet-block">
          <div className="sheet-row"><span className="label">State</span><StatusLabel status={agent.status} /></div>
          <div className="sheet-row sheet-row--stack">
            <span className="label">In progress</span>
            <p>{task?.title ?? (isZeus ? 'Ready to coordinate your next directive.' : 'Awaiting your next directive.')}</p>
          </div>
          {agent.id === 'athena' && (
            <Button variant="outline" onClick={onOpenResearch}><BookOpen size={15} aria-hidden="true" /> Open research library <ArrowRight size={14} aria-hidden="true" /></Button>
          )}
        </div>

        <form className="sheet-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="agent-prompt">{isZeus ? 'Give Zeus a goal' : `Direct ${agent.name}`}</label>
            <textarea id="agent-prompt" ref={field} className="textarea" rows={4} value={text} onChange={e => setText(e.target.value)}
              placeholder={isZeus ? 'What should the workspace do next?' : `What should ${agent.name} do?`} />
          </div>
          <Button type="submit" disabled={busy || !text.trim()}>{isZeus ? 'Delegate through Zeus' : 'Assign directive'} <ArrowRight size={14} aria-hidden="true" /></Button>
        </form>

        <div className="sheet-foot">
          {!isZeus
            ? <Button variant="outline" size="sm" disabled={busy} onClick={onToggle}>
                {agent.status === 'paused' ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
                {agent.status === 'paused' ? 'Resume agent' : 'Pause agent'}
              </Button>
            : <span />}
          <span className="label">{isZeus ? 'Central orchestration' : 'Connected'}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
