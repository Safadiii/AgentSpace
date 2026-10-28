import { useEffect } from 'react'
import { animate, useMotionValue } from 'motion/react'
import { project, rubberband, SPRING, SPRING_MOMENTUM } from '../lib/motion'

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"]'

/** Side sheet that tracks the pointer 1:1, can be grabbed mid-animation, and lands where the flick is heading.
 *  Drives `--drag-x` on the element; CSS composes it with the enter/exit transition. */
export function useDragToDismiss(el: HTMLElement | null, onDismiss: () => void) {
  const x = useMotionValue(0)

  useEffect(() => {
    if (!el) return
    x.set(0)
    el.style.setProperty('--drag-x', '0px')
    const stopWatching = x.on('change', v => el.style.setProperty('--drag-x', `${v}px`))

    let playing: { stop: () => void } | null = null
    let pending = false, dragging = false, originX = 0, originY = 0, base = 0
    let trail: Array<{ x: number; t: number }> = []

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return
      playing?.stop()                       // interrupt: grab it wherever it currently is
      base = x.get(); originX = e.clientX; originY = e.clientY
      pending = true; dragging = false
      trail = [{ x: e.clientX, t: e.timeStamp }]
    }
    const move = (e: PointerEvent) => {
      if (!pending) return
      const dx = e.clientX - originX, dy = e.clientY - originY
      if (!dragging) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return          // hysteresis before committing to a direction
        if (Math.abs(dy) > Math.abs(dx)) { pending = false; return }  // vertical intent belongs to scrolling
        dragging = true; originX = e.clientX
        try { el.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      }
      const raw = base + (e.clientX - originX)
      x.set(raw >= 0 ? raw : -rubberband(-raw, el.offsetWidth))
      trail.push({ x: e.clientX, t: e.timeStamp })
      trail = trail.filter(p => e.timeStamp - p.t < 100)
    }
    const up = (e: PointerEvent) => {
      if (!pending) return
      pending = false
      if (!dragging) return
      dragging = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      const recent = trail.filter(p => e.timeStamp - p.t < 100)   // a pointer that rested before release carries no velocity
      const first = recent[0], last = recent[recent.length - 1]
      const v = first && last && last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0
      const width = el.offsetWidth
      if (x.get() + project(v) > width * 0.35) {                    // decide from where the gesture is going
        playing = animate(x, width + 48, { ...SPRING, velocity: v, onComplete: onDismiss })
      } else {
        playing = animate(x, 0, { ...(Math.abs(v) > 200 ? SPRING_MOMENTUM : SPRING), velocity: v })
      }
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      playing?.stop(); stopWatching()
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
    }
  }, [el, x, onDismiss])
}
