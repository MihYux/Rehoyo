import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAdvisorClient, LiveAdvisorResult, LiveAdvisorStreamEvent } from '../../desktop/bridge'
import { createReleaseProject, deriveReleasePlan, type ReleaseProjectInput } from '../../domain/release-project'
import { createGroundedTestPreset } from '../../test/groundedFixture'
import { ReleaseAssistant } from './ReleaseAssistant'

const projectInput: ReleaseProjectInput = {
  game: '崩坏：星穹铁道',
  version: '2.0',
  updateName: '假如在午夜入梦',
  releaseAt: '2026-09-10T00:00:00.000Z',
  regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'recall',
    secondaryObjectives: [],
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
  const project = createReleaseProject(projectInput, () => new Date('2026-07-24T00:00:00.000Z'))
  return { ...project, researchSnapshot: preset, currentPlan: deriveReleasePlan(project, preset), status: 'review_required' as const }
}

afterEach(() => {
  delete window.rehoyoDesktop
})

describe('ReleaseAssistant', () => {
  it('accepts a free-form question and streams a real grounded AI answer', async () => {
    const user = userEvent.setup()
    let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
    let resolveStream: (result: LiveAdvisorResult) => void = () => {}
    const liveAdvisor: LiveAdvisorClient = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: 'legacy path must not run' })),
      stream: vi.fn(({ requestId }) => new Promise<LiveAdvisorResult>((resolve) => {
        resolveStream = resolve
        emit({ requestId, type: 'start', model: 'glm-5.2' })
      })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      onEvent: vi.fn((listener) => {
        emit = listener
        return vi.fn()
      }),
    }
    window.rehoyoDesktop = { isElectron: true, platform: 'win32', advisor: liveAdvisor }

    render(<ReleaseAssistant project={preparedProject()} region="WEST" onShowEvidence={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '打开常驻发行助手' }))
    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: '询问发行助手' })
    await user.type(input, '这个地区与日本最大的差异是什么？')
    expect(input).toHaveValue('这个地区与日本最大的差异是什么？')
    await user.click(screen.getByRole('button', { name: '发送问题' }))

    expect(liveAdvisor.stream).toHaveBeenCalledOnce()
    const requestId = vi.mocked(liveAdvisor.stream!).mock.calls[0][0].requestId
    act(() => emit({ requestId, type: 'delta', content: '**可继续追问的实时回答** [live-west-001]' }))
    expect(await screen.findByText('可继续追问的实时回答')).toBeInTheDocument()
    expect(input).toHaveValue('')

    act(() => {
      emit({ requestId, type: 'complete', model: 'glm-5.2' })
      resolveStream({ ok: true, content: '**可继续追问的实时回答** [live-west-001]', model: 'glm-5.2', requestId })
    })
  })
})
