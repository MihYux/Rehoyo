import { describe, expect, it } from 'vitest'
import type { AnalysisPreset, EvidenceRecord } from './types'
import {
  approveCharacterSandbox,
  createCharacterSandboxDraft,
  applyStrategyPatch,
  createPlanVersion,
  createReleaseProject,
  deriveReleasePlan,
  isCharacterRelationshipEligible,
  lockReleaseAction,
  pauseCharacterSandbox,
  RELEASE_STORAGE_KEY,
  startCharacterSandbox,
  stopCharacterSandbox,
} from './release-project'

const evidence = (overrides: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  id: 'live-jp-001',
  source: 'Niconico',
  sourceType: 'video',
  region: 'JP',
  language: 'ja-JP',
  author: 'public user',
  title: '2.0 キャラクターと物語の感想',
  excerptOriginal: 'キャラクターとストーリーが好き。音楽も印象的だった。',
  excerptZh: '喜欢角色与故事，音乐也令人印象深刻。',
  sentiment: 'positive',
  topics: ['角色塑造', '剧情', '音乐'],
  confidence: 0.91,
  engagement: 12,
  publishedLabel: '2024-02-08',
  url: 'https://www.nicovideo.jp/watch/sm-real',
  retrievedAt: '2026-07-24T00:00:00.000Z',
  synthetic: false,
  ...overrides,
})

const livePreset = (records: EvidenceRecord[]): AnalysisPreset => ({
  id: 'live-research-1',
  dataMode: 'live',
  game: { id: 'hsr', name: '崩坏：星穹铁道', shortName: 'HSR', accent: '#2791a8' },
  version: { id: '2.0', label: '2.0', title: '假如在午夜入梦' },
  durationMs: 1200,
  regions: ['CN', 'JP', 'WEST'],
  sources: [...new Set(records.map((item) => item.source))],
  agents: [],
  events: [],
  evidence: records,
  report: {
    summary: '', sentimentScore: 50, riskLevel: 'low', sampleCount: records.length,
    positivePercent: 0, neutralPercent: 100, negativePercent: 0,
    trend: [], regions: [], keywords: [], controversies: [], recommendations: [],
  },
  advisorAnswers: [],
})

function projectInput() {
  return {
    game: '崩坏：星穹铁道',
    version: '3.8',
    updateName: '再会，匹诺康尼',
    releaseAt: '2026-09-10T00:00:00.000Z',
    regions: ['CN', 'JP', 'WEST'] as const,
    brief: {
      primaryObjective: 'recall' as const,
      secondaryObjectives: ['activity'],
      activityExpectation: 'high' as const,
      revenueExpectation: 'medium' as const,
      sellingPoints: [{
        id: 'sp-character',
        type: 'character' as const,
        name: '三月七全新形态',
        description: '围绕旅途重逢展开的角色内容。',
        priority: 'primary' as const,
        regionalAdjustmentAllowed: true,
        regions: ['CN', 'JP', 'WEST'] as const,
        assetIds: ['asset-character-pv', 'asset-character-guide'],
      }],
      availableAssets: ['角色PV', '角色设定与审核模板', 'KV'],
      budgetLevel: 'medium' as const,
      teamCapacity: ['社媒运营', '视频剪辑'],
      mandatoryActions: ['版本PV'],
      prohibitedActions: ['未经审核的自由角色聊天'],
      riskPreference: 'balanced' as const,
      allowCharacterRelationshipPilot: true,
    },
  }
}

describe('release project decision domain', () => {
  it('stores version brief facts separately from public evidence', () => {
    const project = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))

    expect(RELEASE_STORAGE_KEY).toBe('rehoyo.release.v1')
    expect(project.status).toBe('brief_draft')
    expect(project.briefFacts.length).toBeGreaterThan(3)
    expect(project.briefFacts.every((fact) => fact.source === 'user_input')).toBe(true)
    expect(project).not.toHaveProperty('evidence')
  })

  it('never turns a missing regional sample into a player preference claim', () => {
    const project = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))
    const plan = deriveReleasePlan(project, livePreset([evidence()]), () => new Date('2026-07-24T00:05:00.000Z'))
    const cn = plan.regionalPlans.find((item) => item.region === 'CN')!
    const jp = plan.regionalPlans.find((item) => item.region === 'JP')!

    expect(cn.evidenceCoverage).toBe('insufficient')
    expect(cn.playerSignals).toEqual([])
    expect(cn.strategySummary).toContain('证据不足')
    expect(cn.decisionTrace.basis).toBe('brief_driven')
    expect(jp.evidenceCoverage).not.toBe('insufficient')
    expect(jp.playerSignals).toEqual(expect.arrayContaining(['角色塑造', '剧情']))
    expect(jp.decisionTrace.evidenceIds).toEqual(['live-jp-001'])
  })

  it('marks low-evidence and high-cost actions for review instead of predicting business outcomes', () => {
    const project = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))
    const plan = deriveReleasePlan(project, livePreset([evidence()]), () => new Date('2026-07-24T00:05:00.000Z'))
    const cnPaid = plan.actions.find((item) => item.region === 'CN' && item.type === 'paid_media')!

    expect(cnPaid.decisionTrace.basis).toBe('brief_driven')
    expect(cnPaid.requiresApproval).toBe(true)
    expect(cnPaid.evaluation.rating).toMatch(/manual_review|limited_pilot/)
    expect(cnPaid.metrics.join(' ')).not.toMatch(/CPA|LTV|收入|营收预测/)
    expect(cnPaid.description).toContain('需要投放数据验证')
  })

  it('allows a character execution sandbox only when all evidence and review gates are present', () => {
    const project = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))
    const records = [evidence()]
    expect(isCharacterRelationshipEligible(project.brief, records, 'JP')).toMatchObject({ eligible: true })
    expect(isCharacterRelationshipEligible(project.brief, [], 'JP')).toMatchObject({ eligible: false })

    const noReviewAssets = {
      ...project.brief,
      availableAssets: ['角色PV'],
    }
    expect(isCharacterRelationshipEligible(noReviewAssets, records, 'JP')).toMatchObject({ eligible: false })
  })

  it('protects locked actions and versions accepted patches without overwriting history', () => {
    const project = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))
    const plan = deriveReleasePlan(project, livePreset([evidence()]), () => new Date('2026-07-24T00:05:00.000Z'))
    const action = plan.actions[0]
    const locked = lockReleaseAction(action, true)
    const patch = {
      id: 'patch-1',
      projectId: project.id,
      targetIds: [locked.id],
      reason: '降低执行成本',
      before: { costLevel: locked.costLevel },
      after: { costLevel: 'low' as const },
      affectedRegions: [locked.region],
      affectedActions: [locked.id],
      riskChange: '不变',
      requiresApproval: true,
    }

    expect(() => applyStrategyPatch([locked], patch)).toThrow(/锁定/)
    const draft = createPlanVersion(project.id, plan, [], () => new Date('2026-07-24T00:10:00.000Z'))
    const approved = createPlanVersion(project.id, plan, [draft], () => new Date('2026-07-24T00:20:00.000Z'), 'approved')
    expect(draft.version).toBe('V0.1')
    expect(approved.version).toBe('V1.0')
    expect(draft.status).toBe('draft')
    expect(approved.status).toBe('approved')
  })

  it('requires review before a character sandbox can run and records no player events', () => {
    const base = createReleaseProject(projectInput(), () => new Date('2026-07-24T00:00:00.000Z'))
    const plan = deriveReleasePlan(base, livePreset([evidence()]), () => new Date('2026-07-24T00:05:00.000Z'))
    const project = { ...base, currentPlan: plan }
    const actionId = plan.characterPlans[0].actionId

    const drafted = createCharacterSandboxDraft(project, actionId, 'reviewed_template', () => new Date('2026-07-24T00:10:00.000Z'))
    expect(() => startCharacterSandbox(drafted, actionId)).toThrow(/审批/)
    const approved = approveCharacterSandbox(drafted, actionId, () => new Date('2026-07-24T00:11:00.000Z'))
    const running = startCharacterSandbox(approved, actionId, () => new Date('2026-07-24T00:12:00.000Z'))
    const paused = pauseCharacterSandbox(running, actionId, () => new Date('2026-07-24T00:13:00.000Z'))
    const stopped = stopCharacterSandbox(paused, actionId, () => new Date('2026-07-24T00:14:00.000Z'))
    const execution = stopped.characterExecutions[0]

    expect(execution.status).toBe('stopped')
    expect(execution.events.every((event) => event.sandbox && !('playerId' in event))).toBe(true)
    expect(execution.events.map((event) => event.kind)).toEqual(['content_generated', 'approved', 'started', 'paused', 'stopped'])
  })
})
