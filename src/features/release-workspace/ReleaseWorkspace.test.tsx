import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisPreset, EvidenceRecord } from '../../domain/types'
import { createReleaseProject, deriveReleasePlan, type ReleaseProjectInput } from '../../domain/release-project'
import { ReleaseWorkspace } from './ReleaseWorkspace'

const record: EvidenceRecord = {
  id: 'live-jp-001', source: 'Niconico', sourceType: 'video', region: 'JP', language: 'ja-JP', author: 'public user',
  title: 'キャラクターと物語の感想', excerptOriginal: 'キャラクターとストーリーが好き。', excerptZh: '喜欢角色与故事。',
  sentiment: 'positive', topics: ['角色塑造', '剧情'], confidence: 0.9, engagement: 7, publishedLabel: '2024-02-08',
  url: 'https://www.nicovideo.jp/watch/sm-real', retrievedAt: '2026-07-24T00:00:00.000Z', synthetic: false,
}

const input: ReleaseProjectInput = {
  game: '崩坏：星穹铁道', version: '3.8', updateName: '再会，匹诺康尼', releaseAt: '2026-09-10T00:00:00.000Z', regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'recall', secondaryObjectives: [], activityExpectation: 'high', revenueExpectation: 'medium',
    sellingPoints: [{ id: 'sp-character', type: 'character', name: '三月七全新形态', description: '角色内容', priority: 'primary', regionalAdjustmentAllowed: true, regions: ['CN', 'JP', 'WEST'], assetIds: ['角色PV'] }],
    availableAssets: ['角色PV', '角色设定与审核模板'], budgetLevel: 'medium', teamCapacity: ['社媒运营'], mandatoryActions: [], prohibitedActions: [],
    riskPreference: 'balanced', allowCharacterRelationshipPilot: true,
  },
}

const research = {
  id: 'live-1', dataMode: 'live', game: { id: 'hsr', name: input.game, shortName: 'HSR', accent: '#258ba0' },
  version: { id: '3.8', label: '3.8', title: input.updateName }, durationMs: 1000, regions: ['CN', 'JP', 'WEST'], sources: ['Niconico'], agents: [], events: [], evidence: [record],
  report: { summary: '', sentimentScore: 100, riskLevel: 'low', sampleCount: 1, positivePercent: 100, neutralPercent: 0, negativePercent: 0, trend: [], regions: [], keywords: [], controversies: [], recommendations: [] }, advisorAnswers: [],
} satisfies AnalysisPreset

function preparedProject() {
  const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
  return { ...project, researchSnapshot: research, currentPlan: deriveReleasePlan(project, research), status: 'review_required' as const }
}

describe('release workspace progressive disclosure', () => {
  it('shows one regional decision at a time and keeps execution in a no-send sandbox', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/projects/test/workspace?view=regions']}><ReleaseWorkspace project={preparedProject()} onUpdate={vi.fn()} /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: '区域分析' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /日本/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '发行方案' }))
    expect(screen.getAllByTestId('release-action-row').length).toBeLessThanOrEqual(3)

    await user.click(screen.getByRole('button', { name: /AI角色执行/ }))
    expect(screen.getByRole('heading', { name: 'AI角色发行预演' })).toBeInTheDocument()
    expect(screen.getByText('未连接真实玩家')).toBeInTheDocument()
    expect(screen.getByText(/不会自动发送/)).toBeInTheDocument()
  })
})
