import { describe, expect, it } from 'vitest'
import {
  canGenerateFullReport,
  createCoveragePolicy,
  deriveRegionalCoverage,
} from '../../electron/research-policy.mjs'

type Region = 'CN' | 'JP' | 'WEST'

function playerEvidence(region: Region, index: number, runId = 'run-current') {
  return {
    id: `${runId}-${region}-${index}`,
    runId,
    role: 'player',
    region,
    source: `Source ${index}`,
    url: `https://${region.toLowerCase()}-${index}.example/comments/${index}`,
    excerptOriginal: `${region} verified player comment ${index}`,
    synthetic: false,
  }
}

function records(counts: Record<Region, number>) {
  return (Object.entries(counts) as Array<[Region, number]>).flatMap(([region, count]) =>
    Array.from({ length: count }, (_, index) => playerEvidence(region, index + 1)),
  )
}

function inspectedDomains(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `attempt-${index + 1}`,
    status: 'completed',
    url: `https://inspected-${index + 1}.example/thread`,
    region: (['CN', 'JP', 'WEST'] as const)[index % 3],
  }))
}

describe('live regional research coverage policy', () => {
  it('requires 30 current player records in every region and 30 inspected domains', () => {
    const policy = createCoveragePolicy({ currentRunId: 'run-current' })
    const coverage = deriveRegionalCoverage(
      records({ CN: 30, JP: 29, WEST: 30 }),
      inspectedDomains(30),
      policy,
    )

    expect(coverage.regions.JP).toMatchObject({ evidence: 29, target: 30, reached: false })
    expect(coverage.globalDomains).toBe(30)
    expect(canGenerateFullReport(coverage)).toBe(false)
  })

  it('completes only when all regional and domain quotas are reached', () => {
    const coverage = deriveRegionalCoverage(
      records({ CN: 30, JP: 30, WEST: 30 }),
      inspectedDomains(30),
      createCoveragePolicy({ currentRunId: 'run-current' }),
    )

    expect(coverage.status).toBe('complete')
    expect(coverage.totalEvidence).toBe(90)
    expect(canGenerateFullReport(coverage)).toBe(true)
  })

  it('excludes duplicate, synthetic, context, historical, and non-HTTPS records', () => {
    const valid = playerEvidence('CN', 1)
    const coverage = deriveRegionalCoverage([
      valid,
      { ...valid, id: 'duplicate' },
      { ...playerEvidence('CN', 2), synthetic: true },
      { ...playerEvidence('CN', 3), role: 'context', source: 'Wikipedia' },
      playerEvidence('CN', 4, 'run-historical'),
      { ...playerEvidence('CN', 5), url: 'http://example.com/comment' },
    ], inspectedDomains(1), createCoveragePolicy({ currentRunId: 'run-current' }))

    expect(coverage.regions.CN.evidence).toBe(1)
    expect(coverage.totalEvidence).toBe(1)
  })
})
