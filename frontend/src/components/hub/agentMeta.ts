import { BookOpen, Crown, Feather, Hammer } from 'lucide-react'
import type { AgentId } from '../../types'

export const agentIcons = { zeus: Crown, athena: BookOpen, hermes: Feather, hephaestus: Hammer }
export const agentHint: Record<AgentId, string> = {
  zeus: 'The orchestrator', athena: 'Research & knowledge', hermes: 'Communication', hephaestus: 'Engineering',
}
