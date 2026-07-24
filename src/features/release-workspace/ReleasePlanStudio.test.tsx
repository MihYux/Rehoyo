import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAdvisorClient, LiveAdvisorResult, LiveAdvisorStreamEvent } from '../../desktop/bridge'
import { createReleaseProject, deriveReleasePlan, type ReleaseProjectInput } from '../../domain/release-project'
import { createGroundedTestPreset } from '../../test/groundedFixture'
import { ReleasePlanStudio } from './ReleasePlanStudio'

const input: ReleaseProjectInput = {
  game: '崩坏：星穹铁道', version: '2.0', updateName: '假如在午夜入梦', releaseAt: '2026-09-10T00:00:00.000Z', regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'recall', secondaryObjectives: [], activityExpectation: 'high', revenueExpectation: 'medium',
    sellingPoints: [{ id: 'story', type: 'story', name: '匹诺康尼', description: '剧情版本', priority: 'primary', regionalAdjustmentAllowed: true, regions: ['CN', 'JP', 'WEST'], assetIds: ['版本PV'] }],
    availableAssets: ['版本PV'], budgetLevel: 'medium', teamCapacity: ['社媒运营'], mandatoryActions: [], prohibitedActions: [], riskPreference: 'balanced', allowCharacterRelationshipPilot: false,
  },
}

function preparedProject() {
  const preset = createGroundedTestPreset()
  const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
  return { ...project, researchSnapshot: preset, currentPlan: deriveReleasePlan(project, preset), status: 'review_required' as const }
}

afterEach(() => { delete window.rehoyoDesktop })

describe('ReleasePlanStudio', () => {
  it('shows a fullscreen formatted plan and applies an agent-authored markdown revision', async () => {
    const user = userEvent.setup()
    let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
    let resolveStream: (result: LiveAdvisorResult) => void = () => {}
    const liveAdvisor: LiveAdvisorClient = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: 'legacy' })),
      stream: vi.fn(({ requestId }) => new Promise<LiveAdvisorResult>((resolve) => { resolveStream = resolve; emit({ requestId, type: 'start', model: 'glm-5.2' }) })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      onEvent: vi.fn((listener) => { emit = listener; return vi.fn() }),
    }
    window.rehoyoDesktop = { isElectron: true, platform: 'win32', advisor: liveAdvisor }
    const onUpdate = vi.fn()
    render(<ReleasePlanStudio project={preparedProject()} onUpdate={onUpdate} onShowEvidence={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /全球发行方案/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '发行方案 Agent' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '编辑或追问发行方案' }), '把首周行动写得更具体')
    await user.click(screen.getByRole('button', { name: '发送给发行方案 Agent' }))
    const requestId = vi.mocked(liveAdvisor.stream!).mock.calls[0][0].requestId
    const answer = '建议如下：\n```markdown\n# 修改后的全球发行方案\n\n## 首周行动\n\n- D0 发布版本PV。\n```'
    act(() => emit({ requestId, type: 'delta', content: answer }))
    expect(await screen.findByRole('button', { name: '应用 Agent 修改' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '应用 Agent 修改' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ releasePlanDocument: expect.objectContaining({ revision: 1, markdown: expect.stringContaining('修改后的全球发行方案') }) }))
    act(() => { emit({ requestId, type: 'complete', model: 'glm-5.2' }); resolveStream({ ok: true, content: answer, model: 'glm-5.2', requestId }) })
  })

  it('can launch another real regional search and rebuild the document from returned evidence', async () => {
    const user = userEvent.setup()
    const project = preparedProject()
    const refreshed = { ...createGroundedTestPreset(), id: 'live-refresh' }
    const run = vi.fn(async () => ({ ok: true as const, preset: refreshed }))
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: { getStatus: vi.fn(async () => ({ configured: true, model: 'glm-5.2', retrieval: 'dynamic', searchEndpoint: 'open.bigmodel.cn' })), run, onEvent: vi.fn(() => vi.fn()) },
    }
    const onUpdate = vi.fn()
    render(<ReleasePlanStudio project={project} onUpdate={onUpdate} onShowEvidence={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '继续实时检索并更新方案' }))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ gameName: '崩坏：星穹铁道', regions: ['CN', 'JP', 'WEST'] }))
    expect(await screen.findByText('检索完成，已生成新的方案修订。')).toBeInTheDocument()
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ researchSnapshot: expect.objectContaining({ id: 'live-refresh' }), releasePlanDocument: expect.objectContaining({ revision: 1 }) }))
  })
})
