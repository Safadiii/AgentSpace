import { useEffect, useState } from 'react'
import AthenaScene, { type AthenaPose } from './AthenaScene'
import '../css/agent-working.css'

export type WorkingPhase = { text: string; pose?: AthenaPose }

// These loop while waiting for the server; they are not a measured percentage.
export const SUMMARY_PHASES: WorkingPhase[] = [
  { text: 'Preparing the paper…', pose: 0 },
  { text: 'Opening the source…', pose: 1 },
  { text: 'Reading the findings…', pose: 2 },
  { text: 'Writing the summary…', pose: 3 },
]

export const CREDIBILITY_PHASES: WorkingPhase[] = [
  { text: 'Preparing the assessment…', pose: 0 },
  { text: 'Reading the methodology…', pose: 1 },
  { text: 'Checking the evidence…', pose: 2 },
  { text: 'Reviewing the claims…', pose: 3 },
]

type AgentWorkingProps = {
  phases: WorkingPhase[]
  interval?: number
  label?: string
}

/** Icon-sized Athena silhouette next to a clean, two-line thinking status. */
export default function AgentWorking({
  phases,
  interval = 2600,
  label = 'Working on your request',
}: AgentWorkingProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => { setIndex(0) }, [phases])
  useEffect(() => {
    if (phases.length < 2) return
    const timer = window.setInterval(() => setIndex(i => (i + 1) % phases.length), Math.max(interval, 250))
    return () => window.clearInterval(timer)
  }, [phases, interval])

  if (phases.length === 0) return null

  const current = index % phases.length
  const previous = (current - 1 + phases.length) % phases.length
  const stateOf = (i: number) => i === current ? 'active' : i === previous ? 'exit' : 'idle'
  const pose = (phases[current].pose ?? Math.min(current, 3)) as AthenaPose

  return (
    <div className="aw" role="status">
      <span className="aw-sr">Athena is working. {label}.</span>
      <span className="aw-mark" aria-hidden="true"><AthenaScene pose={pose} size={36} /></span>
      <span className="aw-info" aria-hidden="true">
        <span className="aw-overline"><span className="aw-beacon" /> ATHENA <span className="aw-overline-separator">/</span> PROCESSING</span>
        <span className="aw-text">
          {phases.map((phase, i) => <span key={i} data-state={stateOf(i)}>{phase.text}</span>)}
        </span>
      </span>
    </div>
  )
}
