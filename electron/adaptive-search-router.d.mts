export type LiveRegion = 'CN' | 'JP' | 'WEST'
export type SearchRoute = 'openai_search' | 'bigmodel_search' | 'webfetch'

export interface DiscoveryResult {
  newCandidateUrls?: number
  playwrightOpened?: boolean
  containsPlayerExpression?: boolean
  uniqueRealEvidence?: number
  httpStatus?: number
  errorType?: 'timeout' | string
}

export interface RouteStats {
  attempts: number
  successfulAttempts: number
  successRate: number
  candidates: number
  evidence: number
}

export interface SearchRouterSnapshot {
  region: LiveRegion
  phase: 'warmup' | 'adaptive'
  revision: number
  selections: number
  attempts: number
  weights: Record<SearchRoute, number>
  stats: Record<SearchRoute, RouteStats>
  routes: Record<SearchRoute, RouteStats & {
    circuitState: 'open' | 'probe' | 'closed'
    circuitOpenUntil: number | null
  }>
}

export const SEARCH_ROUTES: readonly SearchRoute[]
export function createWarmupSchedule(runId: string, region: LiveRegion): SearchRoute[]
export function qualifiesAsSuccessfulDiscovery(result?: DiscoveryResult): boolean
export function createAdaptiveSearchRouter(options: {
  runId: string
  now?: () => number
  circuitFailureThreshold?: number
  circuitCooldownMs?: number
}): {
  select(region: LiveRegion): SearchRouterSnapshot & { route: SearchRoute }
  record(region: LiveRegion, route: SearchRoute, result?: DiscoveryResult): {
    route: SearchRoute
    successful?: boolean
    recordedAttempt: boolean
    authRequired: 'openai' | 'bigmodel' | null
    circuitState: 'open' | 'probe' | 'closed'
    snapshot?: SearchRouterSnapshot
  }
  getSnapshot(region: LiveRegion): SearchRouterSnapshot
}
