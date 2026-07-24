import type { CoveragePolicy, LiveRegion, RegionalResearchCoverage } from './research-policy.mjs'
import type { GlmFunctionToolSchema, ResearchAction } from './research-tools.mjs'

export interface RegionalAgentHistoryEntry {
  action: ResearchAction | unknown | null
  result: {
    error?: string
    invalidAction?: boolean
    rejected?: boolean
    reason?: string
    evidenceAdded?: number
    inspectedAdded?: number
    pagesAdded?: number
    candidatesAdded?: number
    message?: string
  }
}

export interface RegionalAgentResult {
  status: 'complete' | 'incomplete'
  region: LiveRegion
  reason?: string
  evidence: any[]
  attempts: any[]
  history: RegionalAgentHistoryEntry[]
  coverage: RegionalResearchCoverage
  invalidActions: number
  consecutiveInvalidActions: number
  startedAt: number
  deadlineAt: number
}

export interface ResearchAgentClock {
  now(): number
  setTimeout?(callback: () => void, delay: number): unknown
  clearTimeout?(handle: unknown): void
}

export interface ResearchModelContext {
  region: LiveRegion
  request: Record<string, unknown>
  quota: Record<string, unknown>
  globalDomains: number
  targetGlobalDomains: number
  history: RegionalAgentHistoryEntry[]
  attemptedQueries: string[]
  toolSchemas: GlmFunctionToolSchema[]
  deadlineAt: number
  requestTimeoutMs: number
  signal: AbortSignal
}

export function runRegionalResearchAgent(input: {
  region: LiveRegion
  request: Record<string, unknown>
  policy: CoveragePolicy
  model: { nextAction(context: ResearchModelContext): Promise<unknown> }
  tools: Record<string, (action: ResearchAction, context?: { signal?: AbortSignal; deadlineAt?: number }) => Promise<any>>
  state?: {
    evidence?: any[]
    attempts?: any[]
    history?: RegionalAgentHistoryEntry[]
    invalidActions?: number
    consecutiveInvalidActions?: number
  }
  onEvent?: (event: any) => void
  signal?: AbortSignal
  maxSteps?: number
  maxRepeatedActions?: number
  maxConsecutiveInvalidActions?: number
  maxTotalInvalidActions?: number
  maxRunMinutes?: number
  requestTimeoutMs?: number
  clock?: ResearchAgentClock
}): Promise<RegionalAgentResult>
