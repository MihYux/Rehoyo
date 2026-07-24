export type ResearchRegion = 'CN' | 'JP' | 'WEST'
export type DiscoveryProvider = 'openai_search' | 'bigmodel_search' | 'webfetch'

export interface ResearchCandidate {
  id: string
  url: string
  title: string
  source: string
  provider: DiscoveryProvider
  discoveryKind?: string
}

export interface SearchActionInput {
  type?: 'search_web'
  query: string
  language: string
  purpose: string
}

export interface DiscoveryInput {
  action: SearchActionInput
  region: ResearchRegion
  request?: Record<string, unknown>
  signal?: AbortSignal
}

export type DiscoveryProviderAdapter = (input: DiscoveryInput) => Promise<{ candidates: ResearchCandidate[] }>

export class ResearchProviderError extends Error {
  provider: 'openai' | 'bigmodel' | 'webfetch'
  status: number
  authRequired: boolean
  retryable: boolean
}

export function createOpenAIWebSearchProvider(config?: {
  endpoint?: string
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): DiscoveryProviderAdapter

export function parseBigModelSearchResponse(payload: unknown): ResearchCandidate[]
export function createBigModelSearchProvider(config?: {
  endpoint?: string
  apiKey?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): DiscoveryProviderAdapter

export function parseBraveCandidates(html: string): ResearchCandidate[]
export function parseRedditRssCandidates(xml: string): ResearchCandidate[]
export function parseNiconicoCandidates(payload: unknown): ResearchCandidate[]
export function createWebFetchDiscoveryProvider(config?: {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): DiscoveryProviderAdapter

export function fetchPublicSupplement(input: {
  url: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
  maxLength?: number
}): Promise<{ url: string; contentType: string; text: string }>

export interface PageJudgmentExpression {
  original: string
  translatedZh: string
  author: string
  sentiment: 'positive' | 'neutral' | 'negative'
  topics: string[]
  confidence: number
  publishedLabel: string
}

export interface PageJudgment {
  relevant: boolean
  containsPlayerExpression: boolean
  needsSupplement: boolean
  reason: string
  expressions: PageJudgmentExpression[]
}

export function judgePageWithBigModel(input: {
  endpoint?: string
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
  region: ResearchRegion
  request?: Record<string, unknown>
  candidate: { url: string; title?: string }
  page: { text?: string; bodyText?: string; extractedText?: string }
  comments?: Array<string | { text?: string }>
  supplement?: { url: string; text: string }
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<PageJudgment>

export function createGlmResearchPlanner(config: {
  endpoint?: string
  apiKey?: string
  model?: string
  toolSchemas: unknown[]
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): {
  nextAction(context?: Record<string, unknown> & { signal?: AbortSignal }): Promise<{
    role?: string
    content?: string | null
    tool_calls: Array<{
      id?: string
      type?: 'function'
      function: { name: string; arguments: string | Record<string, unknown> }
    }>
  }>
}

export const RESEARCH_PROVIDER_DEFAULTS: Readonly<{
  bigModelEndpoint: string
  bigModelModel: string
  openAIEndpoint: string
  openAIModel: string
}>
