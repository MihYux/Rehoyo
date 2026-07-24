import type { CoveragePolicy, LiveRegion, RegionalResearchCoverage } from './research-policy.mjs'

export interface RegionalAgentResult {
  status: 'complete' | 'incomplete'
  region: LiveRegion
  reason?: string
  evidence: any[]
  attempts: any[]
  history: any[]
  coverage: RegionalResearchCoverage
}

export function runRegionalResearchAgent(input: {
  region: LiveRegion
  request: Record<string, unknown>
  policy: CoveragePolicy
  model: { nextAction(context: Record<string, unknown>): Promise<unknown> }
  tools: Record<string, (...args: any[]) => Promise<any>>
  state?: { evidence?: any[]; attempts?: any[]; history?: any[] }
  onEvent?: (event: any) => void
  signal?: AbortSignal
  maxSteps?: number
  maxRepeatedActions?: number
}): Promise<RegionalAgentResult>
