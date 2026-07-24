import type { AnalysisEvent, AnalysisPreset, EvidenceRecord, RegionCode } from '../src/domain/types.js'
import type { GlmRuntimeConfig } from './glm-client.mjs'

export interface LiveResearchRequest {
  gameName: string
  versionLabel: string
  versionTitle: string
  regions: Exclude<RegionCode, 'GLOBAL'>[]
}

export interface LiveSourceDefinition {
  id: string
  name: string
  domains: string[]
  regions: LiveResearchRequest['regions']
  markets: string[]
  language: EvidenceRecord['language']
  sourceType: EvidenceRecord['sourceType']
  discovery: 'direct' | 'web'
  evidenceRole: 'player' | 'context'
}

export interface SourceSearchPlan {
  id: string
  sourceId: string
  region: LiveResearchRequest['regions'][number]
  language: EvidenceRecord['language']
  sourceNames: string[]
  domains: string[]
  query: string
  queries: string[]
  evidenceOffset: number
}

export type ResearchProvider = 'bigmodel' | 'brave'

export interface ResearchAttempt {
  id: string
  plan: SourceSearchPlan
  provider: ResearchProvider
  query: string
  round: number
  records: EvidenceRecord[]
  error: string
}

export const LIVE_SOURCE_CATALOG: readonly LiveSourceDefinition[]

export function sourceFromUrl(url: string): string

export function buildSourceSearchPlans(
  request: LiveResearchRequest,
  region: LiveResearchRequest['regions'][number],
  runSeed?: string,
): SourceSearchPlan[]

export function parseBraveSearchResults(value: unknown): Array<{
  url: string
  title: string
  publishedAt: string
  content: string
  contentKind: 'comment' | 'post'
}>

export function isSearchResultVersionGrounded(
  item: { title?: string; content?: string; url?: string; publish_date?: string; publishedAt?: string; published_at?: string },
  request: LiveResearchRequest,
): boolean

export function collectResearchCoverage(options: {
  plans: SourceSearchPlan[]
  retrieve: (input: { plan: SourceSearchPlan; provider: ResearchProvider; query: string; round: number }) => Promise<EvidenceRecord[]>
  minimumSites?: number
  minimumEvidence?: number
  concurrency?: number
  providers?: ResearchProvider[]
  onAttempt?: (attempt: ResearchAttempt, progress: { sitesAttempted: number; evidenceCount: number }) => void
}): Promise<{
  evidence: EvidenceRecord[]
  attempts: ResearchAttempt[]
  sitesAttempted: number
  targetReached: boolean
}>

export function decodeXmlEntities(value: unknown): string

export function parseRedditAtom(value: unknown): Array<{
  title: string
  author: string
  url: string
  updated: string
  content: string
}>

export function isVersionRelevant(
  item: { title?: string; content?: string; url?: string; link?: string },
  request: LiveResearchRequest,
): boolean

export function isPublishedInVersionWindow(value: unknown, request: LiveResearchRequest): boolean

export function isPlayerFeedbackResult(item: { title?: string; content?: string }): boolean

export function parseNiconicoSearch(value: unknown): Array<{
  id: string
  title: string
  content: string
  author: string
  registeredAt: string
  viewCount: number
  commentCount: number
  likeCount: number
}>

export function parseNiconicoSnapshot(value: unknown): Array<{
  id: string
  title: string
  content: string
  author: string
  registeredAt: string
  viewCount: number
  commentCount: number
  likeCount: number
}>

export function normalizeSentimentAnalyses(value: unknown): Array<{
  id: string
  sentiment: EvidenceRecord['sentiment']
  topics: string[]
  confidence: number
  excerptZh: string
}>

export function applySentimentAnalysis<T extends Pick<EvidenceRecord, 'id' | 'sentiment' | 'topics' | 'confidence'> & Partial<EvidenceRecord>>(
  evidence: T[],
  result: unknown,
): Array<T & Pick<EvidenceRecord, 'sentiment' | 'topics' | 'confidence' | 'excerptZh'>>

export function sanitizeResearchRequest(value: unknown): LiveResearchRequest

export function runLiveResearch(options: {
  config: GlmRuntimeConfig & { searchBaseUrl?: string }
  request: LiveResearchRequest
  onEvent?: (event: AnalysisEvent) => void
  fetchImpl?: typeof fetch
  getApiKey?: () => Promise<string>
  readKeyFile?: (path: string) => Promise<string>
  now?: () => number
  runSeed?: string
  coveragePolicy?: {
    minimumSites?: number
    minimumEvidence?: number
    maxEvidence?: number
    concurrency?: number
    providers?: ResearchProvider[]
  }
}): Promise<AnalysisPreset>

export const LIVE_SEARCH_BASE_URL: string
