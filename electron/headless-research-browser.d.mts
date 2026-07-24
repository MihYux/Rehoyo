export interface ResearchBrowserTarget {
  id: string
  url: string
  role: 'player' | 'context'
  source: string
  region: string
  language: string
  title?: string
}

export interface ResearchBrowserObservation {
  runId: string
  agentId: string
  id: string
  url: string
  source: string
  role: 'player' | 'context'
  region: string
  language: string
  title?: string
  textPreview?: string
  status: 'navigating' | 'completed' | 'challenge_waiting' | 'failed'
  statusCode?: number
  error?: string
}

export interface ObservedResearchDocument extends ResearchBrowserTarget {
  title: string
  text: string
  retrievedAt: string
}

export function validatePublicHttpsUrl(value: unknown): string
export function createHeadlessResearchBrowser(options?: Record<string, unknown>): {
  observe(targets: ResearchBrowserTarget[], context?: { runId?: string; agentId?: string }): Promise<ObservedResearchDocument[]>
}
