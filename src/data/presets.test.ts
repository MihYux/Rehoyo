import { describe, expect, it } from 'vitest'
import { analysisPresets } from './presets'

describe('analysis presets', () => {
  it('provides three deterministic flagship cases', () => {
    expect(analysisPresets.map((preset) => preset.game.name)).toEqual([
      '原神',
      '崩坏：星穹铁道',
      '绝区零',
    ])
  })

  it.each(analysisPresets)('$game.name keeps report totals and evidence references consistent', (preset) => {
    const evidenceIds = new Set(preset.evidence.map((item) => item.id))
    const referencedIds = [
      ...preset.events.flatMap((event) => event.evidenceIds),
      ...preset.report.controversies.flatMap((item) => item.evidenceIds),
      ...preset.report.recommendations.flatMap((item) => item.evidenceIds),
      ...preset.advisorAnswers.flatMap((item) => item.evidenceIds),
    ]

    expect(preset.agents).toHaveLength(4)
    expect(preset.events.map((event) => event.offsetMs)).toEqual(
      [...preset.events].sort((a, b) => a.offsetMs - b.offsetMs).map((event) => event.offsetMs),
    )
    expect(preset.report.regions.reduce((sum, region) => sum + region.sampleCount, 0)).toBe(
      preset.report.sampleCount,
    )
    expect(
      preset.report.positivePercent +
        preset.report.neutralPercent +
        preset.report.negativePercent,
    ).toBe(100)
    expect(preset.evidence.every((item) => item.synthetic)).toBe(true)
    expect(referencedIds.every((id) => evidenceIds.has(id))).toBe(true)
  })
})
