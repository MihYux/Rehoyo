export type AgentId = 'research' | 'sentiment' | 'regional' | 'strategy'
export type AnalysisPhase = 'idle' | 'research' | 'sentiment' | 'regional' | 'strategy' | 'complete'
export type RegionCode = 'GLOBAL' | 'CN' | 'JP' | 'WEST'
export type Sentiment = 'positive' | 'neutral' | 'negative'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type TaskStatus = 'running' | 'completed' | 'failed'
export type AgentStatus = 'locked' | 'queued' | 'running' | 'handoff' | 'completed' | 'failed'
export type EvidenceLanguage = 'zh-CN' | 'zh-TW' | 'ja-JP' | 'ko-KR' | 'en-US' | 'fr-FR' | 'de-DE' | 'ru-RU' | 'es-ES' | 'pt-BR'

export interface GameIdentity {
  id: string
  name: string
  shortName: string
  accent: string
}

export interface VersionIdentity {
  id: string
  label: string
  title: string
}

export interface AgentDefinition {
  id: AgentId
  name: string
  englishName: string
  objective: string
  startOffsetMs: number
  endOffsetMs: number
  sources: string[]
  outputs: string[]
}

export interface AnalysisEvent {
  id: string
  offsetMs: number
  agentId: AgentId
  phase: AnalysisPhase
  kind: 'status' | 'source' | 'finding' | 'handoff' | 'complete' | 'risk'
  message: string
  evidenceIds: string[]
  progress: number
  region?: RegionCode
  source?: string
  severity?: RiskLevel
  evidenceRecords?: EvidenceRecord[]
  searchProvider?: 'bigmodel' | 'brave'
  query?: string
  sitesAttempted?: number
  evidenceCount?: number
}

export interface EvidenceRecord {
  id: string
  source: string
  sourceType: 'community' | 'video' | 'forum' | 'store'
  region: Exclude<RegionCode, 'GLOBAL'>
  language: EvidenceLanguage
  author: string
  excerptOriginal: string
  excerptZh: string
  sentiment: Sentiment
  topics: string[]
  confidence: number
  engagement: number
  publishedLabel: string
  title?: string
  url: string
  retrievedAt: string
  synthetic: false
  contentKind?: 'comment' | 'post'
  discoveryProvider?: 'direct' | 'bigmodel' | 'brave'
}

export interface TrendPoint {
  label: string
  positive: number
  neutral: number
  negative: number
}

export interface RegionInsight {
  region: Exclude<RegionCode, 'GLOBAL'>
  label: string
  sentimentScore: number
  sampleCount: number
  topConcern: string
  secondaryConcern: string
  insight: string
}

export interface KeywordInsight {
  label: string
  weight: number
  sentiment: Sentiment
}

export interface ControversyInsight {
  id: string
  title: string
  description: string
  severity: RiskLevel
  region: RegionCode
  evidenceIds: string[]
  propagation: string
}

export interface Recommendation {
  id: string
  priority: 'P0' | 'P1' | 'P2'
  title: string
  action: string
  rationale: string
  region: RegionCode
  evidenceIds: string[]
}

export interface InsightReport {
  summary: string
  sentimentScore: number
  riskLevel: RiskLevel
  sampleCount: number
  positivePercent: number
  negativePercent: number
  neutralPercent: number
  trend: TrendPoint[]
  regions: RegionInsight[]
  keywords: KeywordInsight[]
  controversies: ControversyInsight[]
  recommendations: Recommendation[]
}

export interface AdvisorAnswer {
  id: string
  question: string
  matchers: string[]
  answer: string
  evidenceIds: string[]
  reportTab: 'overview' | 'regions' | 'controversies' | 'strategy'
}

export interface AnalysisPreset {
  id: string
  game: GameIdentity
  version: VersionIdentity
  durationMs: number
  regions: Exclude<RegionCode, 'GLOBAL'>[]
  sources: string[]
  agents: AgentDefinition[]
  events: AnalysisEvent[]
  evidence: EvidenceRecord[]
  report: InsightReport
  advisorAnswers: AdvisorAnswer[]
  isGeneric?: boolean
  dataMode: 'live'
  researchCoverage?: {
    targetSites: number
    targetEvidence: number
    sitesAttempted: number
    evidenceCollected: number
    attempts: number
    providers: string[]
    targetReached: boolean
  }
}

export interface RuntimeTask {
  id: string
  presetId: string
  gameName: string
  versionTitle: string
  status: TaskStatus
  startedAt: number
  elapsedMs: number
  visibleEventIds: string[]
  completedAt?: number
  dataMode: 'live'
  presetSnapshot?: AnalysisPreset
}

export interface AgentRuntimeState {
  id: AgentId
  status: AgentStatus
  progress: number
  evidenceIds: string[]
  findingIds: string[]
}

export type AgentStateMap = Record<AgentId, AgentRuntimeState>
