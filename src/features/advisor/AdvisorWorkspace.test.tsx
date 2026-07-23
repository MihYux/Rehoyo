import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LiveAdvisorClient, LiveAdvisorResult, LiveAdvisorStreamEvent } from '../../desktop/bridge'
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

  it('renders progressive GLM Markdown and stops without discarding received text', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
    let resolveStream: (result: LiveAdvisorResult) => void = () => {}
    const unsubscribe = vi.fn()
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
        return unsubscribe
      }),
    }

    const view = render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} liveAdvisor={liveAdvisor} />)
    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    const requestId = liveAdvisor.stream && vi.mocked(liveAdvisor.stream).mock.calls[0][0].requestId
    act(() => {
      emit({ requestId: String(requestId), type: 'delta', content: '## 地区结论\n\n- 中国：关注强度' })
    })
    expect(await screen.findByRole('heading', { level: 2, name: '地区结论' })).toBeInTheDocument()
    expect(screen.getByText('中国：关注强度')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '停止生成' }))
    expect(liveAdvisor.cancel).toHaveBeenCalledWith(requestId)
    act(() => {
      emit({ requestId: String(requestId), type: 'cancelled', error: 'Advisor generation stopped.' })
      resolveStream({ ok: false, error: 'Advisor generation stopped.', cancelled: true })
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2, name: '地区结论' })).toBeInTheDocument()
    expect(screen.getByText(/已停止生成/)).toBeInTheDocument()

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('keeps partial streamed Markdown when GLM fails after the first delta', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
    const liveAdvisor: LiveAdvisorClient = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: 'legacy path must not run' })),
      stream: vi.fn(async ({ requestId }) => {
        emit({ requestId, type: 'delta', content: '**已收到的真实分片**' })
        emit({ requestId, type: 'error', error: 'network interrupted' })
        return { ok: false as const, error: 'network interrupted' }
      }),
      cancel: vi.fn(async () => ({ ok: true as const })),
      onEvent: vi.fn((listener) => {
        emit = listener
        return vi.fn()
      }),
    }

    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} liveAdvisor={liveAdvisor} />)
    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    expect(await screen.findByText('已收到的真实分片')).toBeInTheDocument()
    expect(screen.getByText(/回答未完成.*network interrupted/)).toBeInTheDocument()
    expect(screen.queryByText(/测试夹具报告/)).not.toBeInTheDocument()
  })

  it('falls back to the grounded local answer when streaming fails before its first delta', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    let emit: (event: LiveAdvisorStreamEvent) => void = () => {}
    const liveAdvisor: LiveAdvisorClient = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: 'legacy path must not run' })),
      stream: vi.fn(async ({ requestId }) => {
        emit({ requestId, type: 'error', error: 'provider unavailable' })
        return { ok: false as const, error: 'provider unavailable' }
      }),
      cancel: vi.fn(async () => ({ ok: true as const })),
      onEvent: vi.fn((listener) => {
        emit = listener
        return vi.fn()
      }),
    }

    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} liveAdvisor={liveAdvisor} />)
    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '不同地区的真实证据有什么差异？' }))

    expect(await screen.findByText(/测试夹具报告/)).toBeInTheDocument()
    expect(screen.getByText('REAL EVIDENCE FALLBACK')).toBeInTheDocument()
    expect(screen.getByText(/已回退本地证据.*provider unavailable/)).toBeInTheDocument()
  })
})
