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
  fatal?: boolean
  pageId?: string
  action?: 'start' | 'open' | 'scroll' | 'click' | 'type' | 'check' | 'resume' | 'extract_comments'
  screenshotDataUrl?: string
}

export interface ObservedResearchDocument extends ResearchBrowserTarget {
  title: string
  text: string
  retrievedAt: string
}

export interface ObservedResearchCandidate extends ObservedResearchDocument {
  pageId: string
  status: 'completed' | 'challenge_waiting'
  statusCode?: number
  comments: string[]
}

export interface ResearchBrowserPageState {
  pageId: string
  title?: string
  text?: string
  status: 'navigating' | 'completed' | 'challenge_waiting' | 'failed'
  statusCode?: number
}

export class ResearchBrowserFatalError extends Error {
  readonly stage: string
  readonly fatal: true
  readonly cause: unknown
}

export function validatePublicHttpsUrl(value: unknown): string
export function createHeadlessResearchBrowser(options?: {
  browserType?: { launch(options: Record<string, unknown>): Promise<any> }
  onObservation?: (observation: ResearchBrowserObservation) => void
  /** @deprecated Prefer maxPagesGlobal. */
  maxConcurrency?: number
  maxPagesGlobal?: number
  maxPagesPerRegion?: number
  navigationTimeoutMs?: number
  executablePath?: string
  launchOptions?: Record<string, unknown>
}): {
  start(context?: { runId?: string; agentId?: string }): Promise<{ status: 'ready' }>
  open(target: ResearchBrowserTarget, context?: { runId?: string; agentId?: string }): Promise<ResearchBrowserPageState>
  scroll(pageId: string, input?: { direction?: 'up' | 'down'; amount?: number }): Promise<void>
  click(pageId: string, selectorOrPoint: string | { x: number; y: number }): Promise<ResearchBrowserPageState | { pageId: string; status: string }>
  manualClick(pageId: string, selectorOrPoint: string | { x: number; y: number }): Promise<ResearchBrowserPageState | { pageId: string; status: string }>
  type(pageId: string, selector: string, value: string): Promise<ResearchBrowserPageState | { pageId: string; status: string }>
  manualType(pageId: string, selector: string, value: string): Promise<ResearchBrowserPageState | { pageId: string; status: string }>
  check(pageId: string): Promise<ResearchBrowserPageState>
  checkChallenge(pageId: string): Promise<ResearchBrowserPageState>
  resume(pageId: string, input?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<ResearchBrowserPageState>
  resumeChallenge(pageId: string, input?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<ResearchBrowserPageState>
  extractVisibleComments(pageId: string, input?: { selectors?: string[] }): Promise<string[]>
  screenshot(pageId: string): Promise<string>
  observeCandidate(target: ResearchBrowserTarget, context?: {
    runId?: string
    agentId?: string
    selectors?: string[]
    scrollAmount?: number
  }): Promise<ObservedResearchCandidate>
  closePage(pageId: string): Promise<void>
  close(): Promise<void>
  observe(targets: ResearchBrowserTarget[], context?: { runId?: string; agentId?: string }): Promise<ObservedResearchDocument[]>
}
