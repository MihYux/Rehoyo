export interface LiveAdvisorStatus {
  configured: boolean
  endpoint: string
  model: string
}

export type ConnectionProvider = 'ai' | 'search'
export type ConnectionField = 'ai.apiKey' | 'ai.endpoint' | 'search.apiKey' | 'search.endpoint'
export type ConnectionPersistence = 'encrypted' | 'session' | 'environment' | 'external' | 'none'

export interface ProviderConnectionStatus {
  configured: boolean
  provider: 'bigmodel' | 'openai'
  endpoint: string
  model: 'glm-5.2' | 'gpt-5.6'
  persistence: ConnectionPersistence
  warning?: string
}

export interface ConnectionStatus {
  configured: boolean
  ai: ProviderConnectionStatus & { provider: 'bigmodel'; model: 'glm-5.2' }
  search: ProviderConnectionStatus & { provider: 'openai'; model: 'gpt-5.6' }
  missing: readonly ConnectionField[]
}

export interface ProviderConnectionInput {
  apiKey: string
  endpoint: string
}

export interface ConnectionClient {
  getStatus: () => Promise<ConnectionStatus>
  save: (input: { ai?: ProviderConnectionInput; search?: ProviderConnectionInput }) => Promise<ConnectionStatus>
  clear: (provider?: ConnectionProvider) => Promise<ConnectionStatus>
  invalidate: (provider: ConnectionProvider) => Promise<ConnectionStatus>
  onStatus?: (listener: (status: ConnectionStatus) => void) => () => void
}

export interface LiveAdvisorRequest {
  question: string
  localAnswer: string
  dataMode: 'live'
  evidence: Array<{
    id: string
    source: string
    region: string
    excerptZh: string
    sentiment: string
    topics: string[]
    title?: string
    url: string
  }>
}

export type LiveAdvisorResult =
  | { ok: true; content: string; model: string; requestId: string }
  | { ok: false; error: string; cancelled?: boolean }

export type LiveAdvisorStreamEvent =
  | { requestId: string; type: 'start'; model: string }
  | { requestId: string; type: 'delta'; content: string }
  | { requestId: string; type: 'complete'; model: string }
  | { requestId: string; type: 'error' | 'cancelled'; error: string }

export interface LiveAdvisorStreamRequest {
  requestId: string
  request: LiveAdvisorRequest
}

export interface LiveAdvisorClient {
  getStatus: () => Promise<LiveAdvisorStatus>
  ask: (request: LiveAdvisorRequest) => Promise<LiveAdvisorResult>
  stream?: (request: LiveAdvisorStreamRequest) => Promise<LiveAdvisorResult>
  cancel?: (requestId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onEvent?: (listener: (event: LiveAdvisorStreamEvent) => void) => () => void
}

export interface RehoyoDesktopBridge {
  isElectron: true
  platform: string
  connection?: ConnectionClient
  advisor?: LiveAdvisorClient
  research?: LiveResearchClient
}

export interface LiveResearchStatus {
  configured: boolean
  model: string
  retrieval: string
  searchEndpoint: string
}

export interface LiveResearchEventPayload {
  runId: string
  event: import('../domain/types').AnalysisEvent & {
    evidenceRecords?: import('../domain/types').EvidenceRecord[]
  }
}

export type LiveResearchResult =
  | { ok: true; preset: import('../domain/types').AnalysisPreset }
  | { ok: false; error: string }

export interface LiveResearchClient {
  getStatus: () => Promise<LiveResearchStatus>
  run: (request: {
    runId: string
    gameName: string
    versionLabel: string
    versionTitle: string
    regions: string[]
  }) => Promise<LiveResearchResult>
  onEvent: (listener: (payload: LiveResearchEventPayload) => void) => () => void
}

declare global {
  interface Window {
    rehoyoDesktop?: RehoyoDesktopBridge
  }
}

export function getLiveAdvisorClient() {
  return window.rehoyoDesktop?.advisor
}

export function getLiveResearchClient() {
  return window.rehoyoDesktop?.research
}

export function getConnectionClient() {
  return window.rehoyoDesktop?.connection
}
