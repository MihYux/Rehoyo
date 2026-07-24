export type LiveRegion = 'CN' | 'JP' | 'WEST'

export interface CoveragePolicy {
  currentRunId: string
  requestedRegions: LiveRegion[]
  evidencePerRegion: number
  globalDomains: number
  maxConcurrentPages: number
  maxRunMinutes: number
}

export interface RegionCoverage {
  evidence: number
  target: number
  domains: number
  attempts: number
  reached: boolean
  exhausted: boolean
}

export interface RegionalResearchCoverage {
  status: 'incomplete' | 'complete'
  regions: Record<LiveRegion, RegionCoverage>
  totalEvidence: number
  globalDomains: number
  targetGlobalDomains: number
  targetReached: boolean
  canResume: boolean
  limitations: string[]
}

export function createCoveragePolicy(input?: Partial<CoveragePolicy>): CoveragePolicy
export function deriveRegionalCoverage(evidence: unknown[], attempts: unknown[], policy?: CoveragePolicy | Partial<CoveragePolicy>): RegionalResearchCoverage
export function canGenerateFullReport(coverage: RegionalResearchCoverage): boolean
export const LIVE_REGIONS: readonly LiveRegion[]
