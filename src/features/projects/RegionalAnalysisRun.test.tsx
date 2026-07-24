import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveResearchClient, LiveResearchEventPayload } from '../../desktop/bridge'
import { createReleaseProject, type ReleaseProjectInput } from '../../domain/release-project'
import { RegionalAnalysisRun } from './RegionalAnalysisRun'

const input: ReleaseProjectInput = {
  game: '崩坏：星穹铁道', version: '2.0', updateName: '假如在午夜入梦', releaseAt: '2026-09-10T00:00:00.000Z', regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'recall', secondaryObjectives: [], activityExpectation: 'high', revenueExpectation: 'medium',
    sellingPoints: [{ id: 'story', type: 'story', name: '匹诺康尼', description: '剧情版本', priority: 'primary', regionalAdjustmentAllowed: true, regions: ['CN', 'JP', 'WEST'], assetIds: ['版本PV'] }],
    availableAssets: ['版本PV'], budgetLevel: 'medium', teamCapacity: ['社媒运营'], mandatoryActions: [], prohibitedActions: [], riskPreference: 'balanced', allowCharacterRelationshipPilot: false,
  },
}

afterEach(() => { delete window.rehoyoDesktop })

describe('RegionalAnalysisRun', () => {
  it('keeps the live IPC event subscription after the StrictMode effect remount', async () => {
    const listeners = new Set<(payload: LiveResearchEventPayload) => void>()
    let resolveRun: (value: { ok: false; error: string }) => void = () => {}
    const run = vi.fn<LiveResearchClient['run']>(() => new Promise<{ ok: false; error: string }>((resolve) => { resolveRun = resolve }))
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(async () => ({ configured: true, model: 'glm-5.2', retrieval: 'dynamic', searchEndpoint: 'open.bigmodel.cn' })),
        run,
        onEvent: vi.fn((listener) => { listeners.add(listener); return () => listeners.delete(listener) }),
      },
    }
    const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
    render(<StrictMode><RegionalAnalysisRun project={project} onComplete={vi.fn()} /></StrictMode>)

    expect(run).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(1)
    const runId = vi.mocked(run).mock.calls[0][0].runId
    listeners.forEach((listener) => listener({ runId, event: { id: 'event-1', offsetMs: 0, agentId: 'research', phase: 'research', kind: 'status', message: '社区研究 Agent 已开始真实检索', evidenceIds: [], progress: 4 } }))
    expect((await screen.findAllByText('社区研究 Agent 已开始真实检索')).length).toBeGreaterThan(0)

    resolveRun({ ok: false, error: 'test cleanup' })
  })
})
