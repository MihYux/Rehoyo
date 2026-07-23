import { describe, expect, it } from 'vitest'
import { analysisPresets } from '../data/presets'
import { createGroundedTestPreset } from '../test/groundedFixture'
import { getAdvisorResponse } from './advisor'

describe('advisor response matching', () => {
  it('returns a grounded answer with real evidence references', () => {
    const response = getAdvisorResponse(createGroundedTestPreset(), '欧美玩家为什么不喜欢这个版本？')

    expect(response.isFallback).toBe(false)
    expect(response.evidenceIds).toContain('live-west-001')
    expect(response.reportTab).toBe('regions')
  })

  it('refuses to answer when no retrieved evidence exists', () => {
    const response = getAdvisorResponse(analysisPresets[0], '这次更新会提升服务器帧率吗？')

    expect(response.isFallback).toBe(true)
    expect(response.evidenceIds).toEqual([])
    expect(response.answer).toContain('不会生成替代评论或推测数据')
  })
})
