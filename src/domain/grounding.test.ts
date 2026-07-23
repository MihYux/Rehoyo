import { describe, expect, it } from 'vitest'
import { createGroundedCompletedTask, createGroundedTestPreset } from '../test/groundedFixture'
import { isCompletedGroundedTask, isGroundedEvidence, isGroundedLivePreset } from './grounding'

describe('real evidence integrity gate', () => {
  it('accepts a complete report whose evidence has HTTPS provenance', () => {
    const preset = createGroundedTestPreset()
    expect(preset.evidence.every(isGroundedEvidence)).toBe(true)
    expect(isGroundedLivePreset(preset)).toBe(true)
    expect(isCompletedGroundedTask(createGroundedCompletedTask(preset))).toBe(true)
  })

  it('rejects synthetic, URL-less, duplicate, or uncited report data', () => {
    const preset = createGroundedTestPreset()
    expect(isGroundedLivePreset({ ...preset, evidence: preset.evidence.map((item) => ({ ...item, synthetic: true })) })).toBe(false)
    expect(isGroundedLivePreset({ ...preset, evidence: preset.evidence.map((item) => ({ ...item, url: '' })) })).toBe(false)
    expect(isGroundedLivePreset({ ...preset, evidence: [preset.evidence[0], preset.evidence[0]] })).toBe(false)
    expect(isGroundedLivePreset({
      ...preset,
      report: { ...preset.report, recommendations: [{ ...preset.report.recommendations[0], evidenceIds: ['missing'] }] },
    })).toBe(false)
  })
})
