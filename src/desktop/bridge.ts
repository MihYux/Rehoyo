export interface LiveAdvisorStatus {
  configured: boolean
  endpoint: string
  model: string
}

export interface LiveAdvisorRequest {
  question: string
  localAnswer: string
  evidence: Array<{
    id: string
    source: string
    region: string
    excerptZh: string
    sentiment: string
    topics: string[]
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
}

declare global {
  interface Window {
    rehoyoDesktop?: RehoyoDesktopBridge
  }
}

export function getLiveAdvisorClient() {
  return window.rehoyoDesktop?.advisor
}
