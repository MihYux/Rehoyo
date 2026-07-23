import { describe, expect, it } from 'vitest'
import { advanceToElapsedTime, deriveAgentStates, startTask } from './engine'
import type { AnalysisPreset } from './types'

const preset: AnalysisPreset = {
  id: 'fixture',
  dataMode: 'live',
  game: { id: 'game', name: '测试游戏', shortName: 'TEST', accent: '#67d8f2' },
  version: { id: 'v1', label: '1.0', title: '测试更新' },
  durationMs: 40_000,
  regions: ['CN', 'JP', 'WEST'],
  sources: ['Reddit', 'Bilibili'],
  agents: [],
  events: [
    { id: 'e1', offsetMs: 0, agentId: 'research', phase: 'research', kind: 'status', message: '研究启动', evidenceIds: [], progress: 5 },
    { id: 'e2', offsetMs: 10_000, agentId: 'sentiment', phase: 'sentiment', kind: 'status', message: '情绪分析启动', evidenceIds: [], progress: 10 },
    { id: 'e3', offsetMs: 20_000, agentId: 'regional', phase: 'regional', kind: 'finding', message: '地区差异发现', evidenceIds: [], progress: 20 },
    { id: 'e4', offsetMs: 30_000, agentId: 'strategy', phase: 'strategy', kind: 'handoff', message: '策略综合', evidenceIds: [], progress: 50 },
    { id: 'e5', offsetMs: 40_000, agentId: 'strategy', phase: 'complete', kind: 'complete', message: '报告完成', evidenceIds: [], progress: 100 },
  ],
  evidence: [],
  report: {
    summary: '',
    sentimentScore: 0,
    riskLevel: 'medium',
    sampleCount: 0,
    positivePercent: 0,
    negativePercent: 0,
    neutralPercent: 0,
    trend: [],
    regions: [],
    keywords: [],
    controversies: [],
    recommendations: [],
  },
  advisorAnswers: [],
}

describe('analysis engine', () => {
  it('starts with only the research agent running', () => {
    const task = startTask(preset, 1_000)
    const states = deriveAgentStates(preset, task)

    expect(task.status).toBe('running')
    expect(states.research.status).toBe('running')
    expect(states.sentiment.status).toBe('queued')
    expect(states.regional.status).toBe('queued')
    expect(states.strategy.status).toBe('locked')
  })

  it('advances deterministically and completes at the preset duration', () => {
    const task = startTask(preset, 1_000)
    const halfway = advanceToElapsedTime(preset, task, 20_000)
    const complete = advanceToElapsedTime(preset, task, 40_000)

    expect(halfway.visibleEventIds).toEqual(['e1', 'e2', 'e3'])
    expect(halfway.status).toBe('running')
    expect(complete.visibleEventIds).toHaveLength(5)
    expect(complete.status).toBe('completed')
  })
})
