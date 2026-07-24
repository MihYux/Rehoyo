export interface OpenAIWebCandidate {
  id: string
  url: string
  title: string
  discoveryKind: 'web_search_source' | 'url_citation'
  provider: 'openai_search'
}

export interface OpenAIWebSearchResult {
  requestId: string
  model: string
  candidates: OpenAIWebCandidate[]
  modelText: string
}

export class ProviderAuthenticationError extends Error {
  provider: 'openai' | 'bigmodel'
  status: number
}

export function createOpenAIWebSearchBody(input: { model?: string; input: string }): Record<string, unknown>
export function parseOpenAIWebSearchResponse(payload: unknown): OpenAIWebSearchResult
export function searchOpenAIWeb(input: {
  endpoint?: string
  apiKey: string
  model?: string
  input: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<OpenAIWebSearchResult>
export const OPENAI_SEARCH_DEFAULTS: Readonly<{ endpoint: string; model: string }>
