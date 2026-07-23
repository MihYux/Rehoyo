import type { AnalysisPreset, EvidenceRecord, RuntimeTask } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isGroundedEvidence(value: unknown): value is EvidenceRecord {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.source === 'string' && value.source.length > 0 &&
    typeof value.excerptOriginal === 'string' && value.excerptOriginal.trim().length > 0 &&
    typeof value.excerptZh === 'string' && value.excerptZh.trim().length > 0 &&
    ['CN', 'JP', 'WEST'].includes(String(value.region)) &&
    ['positive', 'neutral', 'negative'].includes(String(value.sentiment)) &&
    typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1 &&
    typeof value.retrievedAt === 'string' && Number.isFinite(Date.parse(value.retrievedAt)) &&
    value.synthetic === false &&
    isHttpsUrl(value.url)
  )
}

export function isGroundedLivePreset(value: unknown): value is AnalysisPreset {
  if (!isRecord(value) || value.dataMode !== 'live') return false
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) return false
  if (!value.evidence.every(isGroundedEvidence)) return false

  const evidence = value.evidence as EvidenceRecord[]
  const ids = evidence.map((item) => item.id)
  const validIds = new Set(ids)
  if (validIds.size !== ids.length) return false

  const report = value.report
  if (!isRecord(report) || report.sampleCount !== evidence.length) return false
  const percentages = Number(report.positivePercent) + Number(report.neutralPercent) + Number(report.negativePercent)
  if (percentages !== 100) return false
  const regions = report.regions
  if (!Array.isArray(regions)) return false
  if (!['CN', 'JP', 'WEST'].every((region) => {
    const item = regions.find((candidate: unknown) => isRecord(candidate) && candidate.region === region)
    return isRecord(item) && item.sampleCount === evidence.filter((record) => record.region === region).length
  })) return false
  if (!Array.isArray(value.advisorAnswers) || value.advisorAnswers.length !== 0) return false

  if (!Array.isArray(report.controversies) || !Array.isArray(report.recommendations)) return false
  if (!report.controversies.every((item) => (
    isRecord(item) &&
    Array.isArray(item.evidenceIds) &&
    new Set(item.evidenceIds).size >= 2 &&
    item.evidenceIds.every((id) => typeof id === 'string' && validIds.has(id))
  ))) return false
  if (!report.recommendations.every((item) => (
    isRecord(item) &&
    Array.isArray(item.evidenceIds) &&
    item.evidenceIds.length > 0 &&
    item.evidenceIds.every((id) => typeof id === 'string' && validIds.has(id))
  ))) return false

  if (!Array.isArray(value.events)) return false
  return value.events.every((event) => (
    isRecord(event) &&
    Array.isArray(event.evidenceIds) &&
    event.evidenceIds.every((id) => typeof id === 'string' && validIds.has(id))
  ))
}

export function isCompletedGroundedTask(
  value: unknown,
): value is RuntimeTask & { status: 'completed'; dataMode: 'live'; presetSnapshot: AnalysisPreset } {
  if (!isRecord(value)) return false
  return (
    value.status === 'completed' &&
    value.dataMode === 'live' &&
    typeof value.id === 'string' &&
    typeof value.presetId === 'string' &&
    typeof value.gameName === 'string' &&
    typeof value.versionTitle === 'string' &&
    typeof value.startedAt === 'number' &&
    typeof value.elapsedMs === 'number' &&
    Array.isArray(value.visibleEventIds) &&
    isGroundedLivePreset(value.presetSnapshot)
  )
}
