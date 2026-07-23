import type { AnalysisEvent, AnalysisPreset, EvidenceRecord, RegionCode } from '../src/domain/types.js'
import type { GlmRuntimeConfig } from './glm-client.mjs'

export interface LiveResearchRequest {
  gameName: string
  versionLabel: string
  versionTitle: string
  regions: Exclude<RegionCode, 'GLOBAL'>[]
}

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
}): Promise<AnalysisPreset>

export const LIVE_SEARCH_BASE_URL: string
