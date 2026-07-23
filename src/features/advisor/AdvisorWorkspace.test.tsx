import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { analysisPresets } from '../../data/presets'
import { AdvisorWorkspace } from './AdvisorWorkspace'

describe('AdvisorWorkspace', () => {
  it('answers preset questions and exposes cited evidence', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    const onOpenEvidence = vi.fn()
    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={onOpenEvidence} />)

    await user.click(screen.getByRole('button', { name: '为什么欧美玩家不喜欢这个角色？' }))

    expect(screen.getByText(/宣传呈现的战斗想象/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gi-west-02/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看证据 gi-west-02' }))
    expect(onOpenEvidence).toHaveBeenCalledWith('gi-west-02', 'controversies')
  })

  it('uses the live desktop advisor while preserving local evidence citations', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    const liveAdvisor = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({
        ok: true as const,
        content: 'GLM 实时回答：欧美反馈集中在宣传与体验的落差。[gi-west-02]',
        model: 'glm-5.2',
        requestId: 'request-1',
      })),
    }

    render(
      <AdvisorWorkspace
        preset={preset}
        onBackToReport={vi.fn()}
        onOpenEvidence={vi.fn()}
        liveAdvisor={liveAdvisor}
      />,
    )

    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '为什么欧美玩家不喜欢这个角色？' }))

    expect(await screen.findByText(/GLM 实时回答/)).toBeInTheDocument()
    expect(screen.getByText('GLM-5.2 · LIVE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gi-west-02/i })).toBeInTheDocument()
    expect(liveAdvisor.ask).toHaveBeenCalledWith(expect.objectContaining({
      question: '为什么欧美玩家不喜欢这个角色？',
      evidence: expect.arrayContaining([expect.objectContaining({ id: 'gi-west-02' })]),
    }))
  })

  it('falls back to the local evidence answer when the live model fails', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    const liveAdvisor = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: '请求超时' })),
    }

    render(
      <AdvisorWorkspace
        preset={preset}
        onBackToReport={vi.fn()}
        onOpenEvidence={vi.fn()}
        liveAdvisor={liveAdvisor}
      />,
    )

    expect(await screen.findByText('GLM-5.2 实时连接')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '为什么欧美玩家不喜欢这个角色？' }))

    expect(await screen.findByText(/宣传呈现的战斗想象/)).toBeInTheDocument()
    expect(screen.getByText(/实时模型不可用，已回退本地证据/)).toBeInTheDocument()
    expect(screen.getByText('LOCAL SNAPSHOT')).toBeInTheDocument()
  })
})
