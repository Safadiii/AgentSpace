import { useEffect, useRef } from 'react'
import { createDotField } from '../../lib/dotField'

/** Fixed dot-matrix background for the console. Runs only while `active` and is purely decorative. */
export default function DotField({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active || !ref.current) return
    return createDotField(ref.current)
  }, [active])
  return <canvas ref={ref} className="dot-field" aria-hidden="true" />
}
