import type { LiveRegion, SearchRoute } from './adaptive-search-router.mjs'

export interface AdaptiveResearchCandidate {
  id: string
  title: string
  source: string
  url: string
}

export interface AdaptiveResearchChainResult {
  status: 'complete' | 'incomplete'
  evidence: Record<string, unknown>[]
  attempts: Record<string, unknown>[]
  coverage: {
    regions: Record<LiveRegion, { evidence: number; target: number; reached: boolean }>
    totalEvidence: number
    targetEvidence: number
    uniqueDomains: number
    targetDomains: number
    regionsReached: boolean
    domainsReached: boolean
    targetReached: boolean
  }
  events: Record<string, unknown>[]
  routeSnapshots: Record<string, unknown>
}

export function runAdaptiveResearchChain(input: {
  runId: string
  request: Record<string, unknown>
  regions?: LiveRegion[]
  evidencePerRegion?: number
  globalDomainTarget?: number
  maxAttemptsPerRegion?: number
  maxRunMinutes?: number
  router?: any
  browser: any
  planner: { nextAction(context: unknown): Promise<Record<string, unknown>> }
  providers: Record<SearchRoute, (context: unknown) => Promise<{ candidates?: AdaptiveResearchCandidate[]; modelText?: string }>>
  judgePage(context: unknown): Promise<Record<string, unknown>>
  fetchSupplement?(context: unknown): Promise<{ url: string; text: string } | undefined>
  historyStore?: any
  waitForReauthentication?(provider: 'openai' | 'bigmodel', error: Error): Promise<void>
  onEvent?(event: Record<string, unknown>): void
  now?: () => number
  signal?: AbortSignal
}): Promise<AdaptiveResearchChainResult>
