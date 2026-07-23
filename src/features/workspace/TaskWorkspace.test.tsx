import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { analysisPresets } from '../../data/presets'
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
})
