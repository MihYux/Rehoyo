import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { analysisPresets } from '../../data/presets'
import type { LiveResearchEventPayload } from '../../desktop/bridge'
import { advanceToElapsedTime, startTask } from '../../domain/engine'
import { TaskWorkspace } from './TaskWorkspace'

describe('TaskWorkspace', () => {
  it('shows live agent states and the visible event timeline', async () => {
    const preset = analysisPresets[0]
    const task = advanceToElapsedTime(preset, startTask(preset, 1_000), 19_000)
    const user = userEvent.setup()

    render(
      <TaskWorkspace
        preset={preset}
        initialTask={task}
        clock={() => 20_000}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Agent 协作空间' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /社区研究 Agent/ })).toHaveTextContent(/交接中|运行中/)
    expect(screen.getByRole('button', { name: /玩家情绪 Agent/ })).toHaveTextContent('运行中')
    expect(screen.getByRole('button', { name: /策略建议 Agent/ })).toHaveTextContent('等待依赖')
    expect(screen.getByRole('log')).toHaveTextContent('社区研究 Agent 已启动全球公开讨论扫描')

    await user.click(screen.getByRole('button', { name: /地区差异 Agent/ }))
    expect(await screen.findByRole('heading', { name: 'Agent 任务检查器' })).toBeInTheDocument()
    expect(screen.getByText('比较中国、日本与欧美玩家的关注点和语义差异。')).toBeInTheDocument()
  })

  it('notifies completion once even while the runtime interval keeps ticking', async () => {
    vi.useFakeTimers()
    const preset = analysisPresets[0]
    const onComplete = vi.fn()
    const task = startTask(preset, 1_000)

    render(
      <TaskWorkspace
        preset={preset}
        initialTask={task}
        clock={() => 1_000 + preset.durationMs}
        onComplete={onComplete}
      />,
    )

    for (let tick = 0; tick < 14; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120)
      })
    }

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0]).toMatchObject({ status: 'completed' })
    vi.useRealTimers()
  })

  it('streams real Electron research events and completes with the returned evidence preset', async () => {
    const base = analysisPresets[0]
    const liveEvidence = {
      ...base.evidence[0],
      id: 'live-cn-001',
      title: '原神 5.0 玩家实测讨论',
      url: 'https://www.bilibili.com/video/BV1REALCN/',
      synthetic: false,
    }
    const liveEvent = {
      ...base.events[0],
      id: 'live-event-001',
      message: 'CN 公开网页搜索返回 1 条相关页面',
      evidenceIds: [liveEvidence.id],
      evidenceRecords: [liveEvidence],
    }
    const completedEvent = {
      ...base.events.at(-1)!,
      id: 'live-event-002',
      offsetMs: 1_000,
      message: '真实全球玩家洞察报告已生成',
      evidenceIds: [liveEvidence.id],
    }
    const livePreset = {
      ...base,
      id: 'live-preset',
      dataMode: 'live' as const,
      durationMs: 1_000,
      events: [liveEvent, completedEvent],
      evidence: [liveEvidence],
      report: { ...base.report, sampleCount: 1 },
    }
    let listener: ((payload: LiveResearchEventPayload) => void) | undefined
    const run = vi.fn(async (request: { runId: string }) => {
      listener?.({ runId: request.runId, event: liveEvent })
      listener?.({ runId: request.runId, event: completedEvent })
      return { ok: true as const, preset: livePreset }
    })
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(),
        run,
        onEvent: vi.fn((callback) => { listener = callback; return () => { listener = undefined } }),
      },
    }
    const onComplete = vi.fn()
    const task = startTask({ ...base, dataMode: 'live' }, 1_000)

    render(<TaskWorkspace preset={{ ...base, dataMode: 'live' }} initialTask={task} onComplete={onComplete} />)

    expect(await screen.findByText('CN 公开网页搜索返回 1 条相关页面')).toBeInTheDocument()
    expect(screen.getByText('REAL WEB DATA · NO SYNTHETIC FALLBACK')).toBeInTheDocument()
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', presetSnapshot: expect.objectContaining({ dataMode: 'live' }) }),
      expect.objectContaining({ dataMode: 'live' }),
    ), { timeout: 2_500 })
    delete window.rehoyoDesktop
  })
})
