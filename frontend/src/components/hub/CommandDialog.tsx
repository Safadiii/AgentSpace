import { useRef } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import type { AgentId } from '../../types'

interface Props {
  open: boolean
  busy: boolean
  text: string
  target: AgentId | 'auto'
  onText: (value: string) => void
  onTarget: (value: AgentId | 'auto') => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export default function CommandDialog({ open, busy, text, target, onText, onTarget, onOpenChange, onSubmit }: Props) {
  const field = useRef<HTMLTextAreaElement>(null)
  /** Grow from the control that opened it, so the spatial relationship is obvious. */
  const anchorToTrigger = (el: HTMLDivElement | null) => {
    const trigger = document.querySelector('.pill-command')
    if (!el || !trigger) return
    const t = trigger.getBoundingClientRect(), r = el.getBoundingClientRect()
    el.style.setProperty('--origin', `${t.left + t.width / 2 - r.left}px ${t.top + t.height / 2 - r.top}px`)
  }
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit() }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={field} popupRef={anchorToTrigger}>
        <form onSubmit={submit}>
          <DialogTitle>New directive</DialogTitle>
          <DialogDescription>Describe a goal and Zeus routes it, or pick the agent yourself.</DialogDescription>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="directive-text" className="sr-only">Directive</label>
            <textarea id="directive-text" ref={field} className="textarea" rows={4} value={text} onChange={e => onText(e.target.value)}
              placeholder="Describe a goal, ask a question, or delegate a task…"
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit() } }} />
          </div>
          <div className="ui-footer" style={{ justifyContent: 'space-between' }}>
            <div className="field" style={{ margin: 0, gridAutoFlow: 'column', alignItems: 'center' }}>
              <label htmlFor="directive-target">Route to</label>
              <select id="directive-target" className="select" style={{ width: 'auto' }} value={target} onChange={e => onTarget(e.target.value as AgentId | 'auto')}>
                <option value="auto">Zeus decides</option><option value="athena">Athena</option><option value="hermes">Hermes</option><option value="hephaestus">Hephaestus</option>
              </select>
            </div>
            <Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Create directive'} <ArrowRight size={14} aria-hidden="true" /></Button>
          </div>
          <p className="dialog-note">Directives are recorded and routed. Agent execution is not wired up yet.</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
