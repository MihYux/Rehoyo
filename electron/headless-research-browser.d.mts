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
  pageId?: string
  action?: 'open' | 'scroll' | 'click' | 'type' | 'extract_comments'
  screenshotDataUrl?: string
}

export interface ObservedResearchDocument extends ResearchBrowserTarget {
  title: string
  text: string
  retrievedAt: string
}

export function validatePublicHttpsUrl(value: unknown): string
export function createHeadlessResearchBrowser(options?: {
  browserType?: { launch(options: Record<string, unknown>): Promise<any> }
  onObservation?: (observation: ResearchBrowserObservation) => void
  maxConcurrency?: number
  navigationTimeoutMs?: number
}): {
  open(target: ResearchBrowserTarget, context?: { runId?: string; agentId?: string }): Promise<{ pageId: string; title: string; text: string; status: string; statusCode?: number }>
  scroll(pageId: string, input?: { direction?: 'up' | 'down'; amount?: number }): Promise<void>
  click(pageId: string, selector: string): Promise<void>
  type(pageId: string, selector: string, value: string): Promise<void>
  extractVisibleComments(pageId: string, input?: { selectors?: string[] }): Promise<string[]>
  screenshot(pageId: string): Promise<string>
  closePage(pageId: string): Promise<void>
  close(): Promise<void>
  observe(targets: ResearchBrowserTarget[], context?: { runId?: string; agentId?: string }): Promise<ObservedResearchDocument[]>
}
