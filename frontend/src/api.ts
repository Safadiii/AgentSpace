import type { AgentId, HubState, AgentTask, ActivityEvent } from './types'

const KEY = 'olympus-demo-v1'
let demoMode = false
const iso = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

function seed(): HubState {
  const now = iso()
  return {
    agents: [
      { id: 'zeus', name: 'Zeus', role: 'Central intelligence', description: 'Coordinates agents and routes new requests.', status: 'available', updated_at: now },
      { id: 'athena', name: 'Athena', role: 'Research & insight', description: 'Explores information, sources, and ideas.', status: 'available', updated_at: now },
      { id: 'hermes', name: 'Hermes', role: 'Communication', description: 'Handles messages, summaries, and outreach.', status: 'idle', updated_at: now },
      { id: 'hephaestus', name: 'Hephaestus', role: 'Engineering', description: 'Builds tools, writes code, and automates workflows.', status: 'available', updated_at: now },
    ],
    tasks: [],
    events: [{ id: uid(), agent_id: 'zeus', message: 'Olympus initialized. Your agents are ready.', created_at: now }],
  }
}

function local(): HubState {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved) as HubState
  } catch { /* private browsing can prevent storage */ }
  const initial = seed()
  save(initial)
  return initial
}
function save(state: HubState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* still works until reload */ }
}
function event(state: HubState, agent_id: AgentId, message: string) {
  const item: ActivityEvent = { id: uid(), agent_id, message, created_at: iso() }
  state.events.unshift(item)
}
export function chooseAgent(title: string): AgentId {
  const text = title.toLowerCase()
  if (['code', 'build', 'bug', 'script', 'program', 'api', 'automate', 'deploy', 'refactor', 'app', 'test'].some(w => text.includes(w))) return 'hephaestus'
  if (['email', 'write', 'message', 'communicat', 'reply', 'draft', 'announce', 'outreach', 'summarize meeting'].some(w => text.includes(w))) return 'hermes'
  return 'athena'
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(2400),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(typeof result.detail === 'string' ? result.detail : `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  isDemo: () => demoMode,
  async state(): Promise<HubState> {
    if (demoMode) return local()
    try { return await request<HubState>('/api/state') }
    catch {
      demoMode = true
      return local()
    }
  },
  async createTask(title: string, agent_id: AgentId | null): Promise<AgentTask> {
    if (!demoMode) return request('/api/tasks', { method: 'POST', body: JSON.stringify({ title, agent_id }) })
    const state = local()
    const id = agent_id && agent_id !== 'zeus' ? agent_id : chooseAgent(title)
    const agent = state.agents.find(a => a.id === id)!
    if (agent.status === 'paused') throw new Error(`Resume ${agent.name} before assigning work.`)
    const busy = state.tasks.some(t => t.agent_id === id && t.status === 'running')
    const task: AgentTask = { id: uid(), title, agent_id: id, status: busy ? 'queued' : 'running', created_at: iso(), updated_at: iso() }
    state.tasks.unshift(task)
    if (!busy) agent.status = 'working'
    event(state, id, `${agent.name} ${busy ? 'queued' : 'received'} a task: ${title}`)
    save(state)
    return task
  },
  async completeTask(taskId: string): Promise<void> {
    if (!demoMode) { await request('/api/tasks/' + taskId + '/complete', { method: 'POST' }); return }
    const state = local()
    const task = state.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'running') throw new Error('Only running tasks can be completed.')
    task.status = 'completed'
    task.updated_at = iso()
    event(state, task.agent_id, `Task marked complete: ${task.title}`)
    const next = [...state.tasks].reverse().find(t => t.agent_id === task.agent_id && t.status === 'queued')
    if (next) { next.status = 'running'; event(state, task.agent_id, `Next task started: ${next.title}`) }
    else state.agents.find(a => a.id === task.agent_id)!.status = 'available'
    save(state)
  },
  async toggleAgent(agentId: AgentId): Promise<void> {
    if (agentId === 'zeus') throw new Error('Zeus cannot be paused in this prototype.')
    if (!demoMode) { await request('/api/agents/' + agentId + '/toggle', { method: 'POST' }); return }
    const state = local()
    const agent = state.agents.find(a => a.id === agentId)!
    if (agent.status === 'paused') {
      const task = state.tasks.find(t => t.agent_id === agentId && t.status === 'paused')
      if (task) task.status = 'running'
      agent.status = task ? 'working' : 'available'
      event(state, agentId, `${agent.name} resumed.`)
    } else {
      state.tasks.forEach(t => { if (t.agent_id === agentId && t.status === 'running') t.status = 'paused' })
      agent.status = 'paused'
      event(state, agentId, `${agent.name} paused.`)
    }
    agent.updated_at = iso()
    save(state)
  },
}
