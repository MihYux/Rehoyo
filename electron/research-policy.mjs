const REGIONS = Object.freeze(['CN', 'JP', 'WEST'])

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? Math.min(number, maximum) : fallback
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function canonicalEvidenceKey(record) {
  const parsed = httpsUrl(record?.url)
  if (!parsed) return ''
  parsed.hash = ''
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|ref$|source$|share$)/i.test(key)) parsed.searchParams.delete(key)
  }
  const excerpt = String(record?.excerptOriginal || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  return excerpt ? `${parsed.href}\n${excerpt}` : ''
}

export function createCoveragePolicy(input = {}) {
  const requestedRegions = Array.isArray(input.requestedRegions)
    ? [...new Set(input.requestedRegions.filter((region) => REGIONS.includes(region)))]
    : [...REGIONS]
  return Object.freeze({
    currentRunId: String(input.currentRunId || 'current').trim(),
    requestedRegions: requestedRegions.length ? requestedRegions : [...REGIONS],
    evidencePerRegion: positiveInteger(input.evidencePerRegion, 30),
    globalDomains: positiveInteger(input.globalDomains, 30),
    maxConcurrentPages: positiveInteger(input.maxConcurrentPages, 12, 12),
    maxRunMinutes: positiveInteger(input.maxRunMinutes, 45, 180),
  })
}

export function deriveRegionalCoverage(evidence, attempts, policyInput = {}) {
  const policy = policyInput?.evidencePerRegion ? policyInput : createCoveragePolicy(policyInput)
  const uniqueEvidence = new Map()
  for (const record of Array.isArray(evidence) ? evidence : []) {
    if (record?.runId !== policy.currentRunId || record?.role !== 'player' || record?.synthetic !== false) continue
    if (!policy.requestedRegions.includes(record?.region)) continue
    const key = canonicalEvidenceKey(record)
    if (key && !uniqueEvidence.has(key)) uniqueEvidence.set(key, record)
  }

  const inspectedDomains = new Set()
  for (const attempt of Array.isArray(attempts) ? attempts : []) {
    if (!['completed', 'inspected'].includes(String(attempt?.status || ''))) continue
    const parsed = httpsUrl(attempt?.url)
    if (parsed) inspectedDomains.add(parsed.hostname.toLocaleLowerCase().replace(/^www\./, ''))
  }

  const regions = Object.fromEntries(REGIONS.map((region) => {
    const records = [...uniqueEvidence.values()].filter((record) => record.region === region)
    const domains = new Set(records.map((record) => httpsUrl(record.url)?.hostname.toLocaleLowerCase().replace(/^www\./, '')).filter(Boolean))
    const requested = policy.requestedRegions.includes(region)
    return [region, {
      evidence: records.length,
      target: requested ? policy.evidencePerRegion : 0,
      domains: domains.size,
      attempts: (Array.isArray(attempts) ? attempts : []).filter((attempt) => attempt?.region === region).length,
      reached: !requested || records.length >= policy.evidencePerRegion,
      exhausted: false,
    }]
  }))

  const allRegionsReached = policy.requestedRegions.every((region) => regions[region].reached)
  const domainsReached = inspectedDomains.size >= policy.globalDomains
  const complete = allRegionsReached && domainsReached
  const limitations = []
  for (const region of policy.requestedRegions) {
    if (!regions[region].reached) limitations.push(`${region} 仍缺少 ${policy.evidencePerRegion - regions[region].evidence} 条当前真实玩家证据`)
  }
  if (!domainsReached) limitations.push(`仍需实际检查 ${policy.globalDomains - inspectedDomains.size} 个不同公开站点`)

  return {
    status: complete ? 'complete' : 'incomplete',
    regions,
    totalEvidence: uniqueEvidence.size,
    globalDomains: inspectedDomains.size,
    targetGlobalDomains: policy.globalDomains,
    targetReached: complete,
    canResume: !complete,
    limitations,
  }
}

export function canGenerateFullReport(coverage) {
  return coverage?.status === 'complete' && coverage?.targetReached === true
}

export const LIVE_REGIONS = REGIONS
