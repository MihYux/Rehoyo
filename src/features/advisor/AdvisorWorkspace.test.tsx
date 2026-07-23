import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createGroundedTestPreset } from '../../test/groundedFixture'
import { AdvisorWorkspace } from './AdvisorWorkspace'

describe('AdvisorWorkspace', () => {
  it('answers from retrieved evidence and exposes its citation', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    const onOpenEvidence = vi.fn()
    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={onOpenEvidence} />)

    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    expect(screen.getByText(/测试夹具报告/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /live-west-001/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看证据 live-west-001' }))
    expect(onOpenEvidence).toHaveBeenCalledWith('live-west-001', 'controversies')
  })

  it('uses the live desktop advisor while preserving real evidence citations', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    const liveAdvisor = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({
        ok: true as const,
        content: 'GLM 实时回答仅引用本次证据。[live-west-001]',
        model: 'glm-5.2',
        requestId: 'request-1',
      })),
    }

    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} liveAdvisor={liveAdvisor} />)

    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    expect(await screen.findByText(/GLM 实时回答/)).toBeInTheDocument()
    expect(screen.getByText('GLM-5.2 · LIVE')).toBeInTheDocument()
    expect(liveAdvisor.ask).toHaveBeenCalledWith(expect.objectContaining({
      dataMode: 'live',
      evidence: expect.arrayContaining([expect.objectContaining({ id: 'live-west-001', url: expect.stringMatching(/^https:\/\//) })]),
    }))
  })

  it('falls back to the same retrieved evidence when the live model fails', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    const liveAdvisor = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: '请求超时' })),
    }

    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} liveAdvisor={liveAdvisor} />)
    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    expect(await screen.findByText(/测试夹具报告/)).toBeInTheDocument()
    expect(screen.getByText(/实时模型不可用，已回退本地证据/)).toBeInTheDocument()
    expect(screen.getByText('REAL EVIDENCE FALLBACK')).toBeInTheDocument()
  })
})
