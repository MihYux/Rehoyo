import { describe, expect, it } from 'vitest'
import { createGroundedTestPreset } from '../test/groundedFixture'
import { createReleaseProject, deriveReleasePlan, type ReleaseProjectInput } from './release-project'
import { applyReleasePlanMarkdown, buildReleasePlanMarkdown } from './release-plan-markdown'

const input: ReleaseProjectInput = {
  game: '崩坏：星穹铁道',
  version: '2.0',
  updateName: '假如在午夜入梦',
  releaseAt: '2026-09-10T00:00:00.000Z',
  regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'recall',
    secondaryObjectives: ['提升活跃'],
    activityExpectation: 'high',
    revenueExpectation: 'medium',
    sellingPoints: [{ id: 'story', type: 'story', name: '匹诺康尼', description: '剧情版本', priority: 'primary', regionalAdjustmentAllowed: true, regions: ['CN', 'JP', 'WEST'], assetIds: ['版本PV'] }],
    availableAssets: ['版本PV'],
    budgetLevel: 'medium',
    teamCapacity: ['社媒运营'],
    mandatoryActions: [],
    prohibitedActions: [],
    riskPreference: 'balanced',
    allowCharacterRelationshipPilot: false,
  },
}

function preparedProject() {
  const preset = createGroundedTestPreset()
  const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
  return { ...project, researchSnapshot: preset, currentPlan: deriveReleasePlan(project, preset, () => new Date('2026-07-24T00:05:00.000Z')), status: 'review_required' as const }
}

describe('release plan markdown document', () => {
  it('builds a detailed evidence-grounded global release plan', () => {
    const markdown = buildReleasePlanMarkdown(preparedProject())

    expect(markdown).toContain('# 崩坏：星穹铁道 2.0「假如在午夜入梦」全球发行方案')
    expect(markdown).toContain('## 执行摘要')
    expect(markdown).toContain('## 区域发行策略')
    expect(markdown).toContain('### 🇨🇳 中国')
    expect(markdown).toContain('### 🇯🇵 日本')
    expect(markdown).toContain('### 🌐 北美及英语市场')
    expect(markdown).toContain('## 42 天发行节奏')
    expect(markdown).toContain('## 风险、审批与停止条件')
    expect(markdown).toContain('## 衡量指标')
    expect(markdown).toMatch(/\[live-[^\]]+\]/)
    expect(markdown).toContain('https://')
  })

  it('stores every agent edit as an immutable document revision', () => {
    const project = preparedProject()
    const first = applyReleasePlanMarkdown(project, '# 第一版', 'agent', () => new Date('2026-07-24T01:00:00.000Z'))
    const second = applyReleasePlanMarkdown(first, '# 第二版', 'agent', () => new Date('2026-07-24T02:00:00.000Z'))

    expect(second.releasePlanDocument?.revision).toBe(2)
    expect(second.releasePlanDocument?.markdown).toBe('# 第二版')
    expect(second.releasePlanDocument?.revisions.map((item) => item.markdown)).toEqual(['# 第一版', '# 第二版'])
    expect(second.updatedAt).toBe('2026-07-24T02:00:00.000Z')
  })
})
