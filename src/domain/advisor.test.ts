import { describe, expect, it } from 'vitest'
import { analysisPresets } from '../data/presets'
import { getAdvisorResponse } from './advisor'

describe('advisor response matching', () => {
  it('returns a grounded answer with evidence references', () => {
    const response = getAdvisorResponse(analysisPresets[0], '欧美玩家为什么不喜欢这个角色？')

    expect(response.isFallback).toBe(false)
    expect(response.evidenceIds).toContain('gi-west-02')
    expect(response.reportTab).toBe('regions')
  })

  it('states when the current snapshot has insufficient evidence', () => {
    const response = getAdvisorResponse(analysisPresets[0], '这次更新会提升服务器帧率吗？')

    expect(response.isFallback).toBe(true)
    expect(response.evidenceIds).toEqual([])
    expect(response.answer).toContain('当前演示快照没有足够证据')
  })
})
