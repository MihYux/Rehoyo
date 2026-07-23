import { describe, expect, it } from 'vitest'
import { analysisPresets, createCustomPreset } from './presets'

describe('real research targets', () => {
  it('provides three flagship targets without bundled player claims', () => {
    expect(analysisPresets.map((preset) => preset.game.name)).toEqual([
      '原神',
      '崩坏：星穹铁道',
      '绝区零',
    ])

    for (const preset of analysisPresets) {
      expect(preset.dataMode).toBe('live')
      expect(preset.agents).toHaveLength(4)
      expect(preset.evidence).toEqual([])
      expect(preset.events).toEqual([])
      expect(preset.report.sampleCount).toBe(0)
      expect(preset.report.controversies).toEqual([])
      expect(preset.report.recommendations).toEqual([])
      expect(preset.advisorAnswers).toEqual([])
    }
  })

  it('creates custom targets without copying a preset report or comments', () => {
    const preset = createCustomPreset('测试游戏', '2.4 更新')
    expect(preset).toMatchObject({ dataMode: 'live', isGeneric: true })
    expect(preset.evidence).toEqual([])
    expect(preset.report.sampleCount).toBe(0)
  })
})
