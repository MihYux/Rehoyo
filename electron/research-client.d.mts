import type { AnalysisEvent, AnalysisPreset, RegionCode } from '../src/domain/types.js'
import type { GlmRuntimeConfig } from './glm-client.mjs'

export interface LiveResearchRequest {
  gameName: string
  versionLabel: string
  versionTitle: string
  regions: Exclude<RegionCode, 'GLOBAL'>[]
}

export function sanitizeResearchRequest(value: unknown): LiveResearchRequest

export function runLiveResearch(options: {
  config: GlmRuntimeConfig & { searchBaseUrl?: string }
  request: LiveResearchRequest
  onEvent?: (event: AnalysisEvent) => void
  fetchImpl?: typeof fetch
  readKeyFile?: (path: string) => Promise<string>
  now?: () => number
}): Promise<AnalysisPreset>

export const LIVE_SEARCH_BASE_URL: string
