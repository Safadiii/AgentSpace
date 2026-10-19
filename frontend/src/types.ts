export type AgentId = 'zeus' | 'athena' | 'hermes' | 'hephaestus'
export type AgentStatus = 'working' | 'available' | 'idle' | 'paused'
export type TaskStatus = 'running' | 'queued' | 'paused' | 'completed'

export interface Agent {
  id: AgentId
  name: string
  role: string
  description: string
  status: AgentStatus
  updated_at: string
}
export interface AgentTask {
  id: string
  title: string
  agent_id: AgentId
  status: TaskStatus
  created_at: string
  updated_at: string
}
export interface ActivityEvent {
  id: string
  agent_id: AgentId | null
  message: string
  created_at: string
}
export interface HubState {
  agents: Agent[]
  tasks: AgentTask[]
  events: ActivityEvent[]
}
