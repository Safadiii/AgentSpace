/** FastAPI research contract, based on the supplied OpenAPI 3.1 schema. */
const BASE = (import.meta.env.VITE_RESEARCH_API_BASE || '/research').replace(/\/$/, '')

export interface PaperRead {
  id: number
  openalex_id: string
  title: string
  doi?: string | null
  abstract: string | null
  publication_year?: number | null
}

export interface PaperAuthorRead {
  id: number
  author_name: string
  author_order: number
  openalex_author_id?: string | null
}

export interface PaperTopicRead {
  id: number
  topic_name: string
  relevance_score?: number | null
}

export interface PaperDetailedRead {
  id: number
  openalex_id: string
  title: string
  abstract: string | null
  publication_year?: number | null
  authors?: PaperAuthorRead[]
  topics?: PaperTopicRead[]
}

export interface PaperCreate {
  openalex_id: string
  title: string
  doi?: string | null
  abstract?: string | null
  publication_year?: number | null
  publication_date?: string | null
  venue?: string | null
  cited_by_count?: number | null
  landing_page_url?: string | null
  source_metadata?: Record<string, unknown>
  authors?: Array<{ author_name: string; openalex_author_id?: string | null; author_order?: number }>
  topics?: Array<{ topic_name: string; openalex_topic_id?: string | null; relevance_score?: number | null }>
}

export interface ResearchRequest {
  user_id: number
  prompt: string
  paper_count?: number
  exploration_agents?: number
  exploration_ratio?: number
}

export interface ResearchResponse {
  run_id: number
  topic: string
  saved_count: number
  related_topics: string[]
}

export interface ResearchRunResponse {
  run_id: number
  status: string
  papers?: Array<{ rank: number; id: number; title: string; abstract?: string | null; openalex_id: string }>
}

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null
    let reason = `Research API error (${response.status})`
    if (typeof detail === 'string') reason = detail
    if (Array.isArray(detail)) reason = detail.map(x => x && typeof x === 'object' && 'msg' in x ? String(x.msg) : String(x)).join('; ')
    throw new Error(reason)
  }
  return response.json() as Promise<T>
}

export const researchApi = {
  papers: (limit = 20, offset = 0, signal?: AbortSignal) =>
    call<PaperRead[]>(`/papers?limit=${limit}&offset=${offset}`, { signal }),
  detailedPapers: (limit = 20, offset = 0, signal?: AbortSignal) =>
    call<PaperDetailedRead[]>(`/detailed/papers?limit=${limit}&offset=${offset}`, { signal }),
  paper: (id: number, signal?: AbortSignal) =>
    call<PaperRead>(`/papers/${id}`, { signal }),
  detailedPaper: (id: number, signal?: AbortSignal) =>
    call<PaperDetailedRead>(`/papers/${id}/detailed`, { signal }),
  createPaper: (paper: PaperCreate) =>
    call<PaperRead>('/papers', { method: 'POST', body: JSON.stringify(paper) }),
  search: (params: ResearchRequest) =>
    call<ResearchResponse>('/search', { method: 'POST', body: JSON.stringify(params) }),
  run: (runId: number, signal?: AbortSignal) =>
    call<ResearchRunResponse>(`/runs/${runId}`, { signal }),
}
