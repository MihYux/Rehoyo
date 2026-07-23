export interface LiveAdvisorStatus {
  configured: boolean
  endpoint: string
  model: string
}

export interface LiveAdvisorRequest {
  question: string
  localAnswer: string
  dataMode?: 'demo' | 'live'
  evidence: Array<{
    id: string
    source: string
    region: string
    excerptZh: string
    sentiment: string
    topics: string[]
    title?: string
    url?: string
  }>
}

export type LiveAdvisorResult =
  | { ok: true; content: string; model: string; requestId: string }
  | { ok: false; error: string }

export interface LiveAdvisorClient {
  getStatus: () => Promise<LiveAdvisorStatus>
  ask: (request: LiveAdvisorRequest) => Promise<LiveAdvisorResult>
}

export interface RehoyoDesktopBridge {
  isElectron: true
  platform: string
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
