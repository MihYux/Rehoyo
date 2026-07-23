import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskLobby } from './TaskLobby'

describe('TaskLobby', () => {
  it('presents the ReHoYo brand and three flagship games', () => {
    render(<TaskLobby recentTasks={[]} onStart={vi.fn()} onOpenReport={vi.fn()} />)

    expect(screen.getByRole('img', { name: 'ReHoYo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /原神/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /崩坏：星穹铁道/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /绝区零/ })).toBeInTheDocument()
  })

  it('collects a custom game and update before starting', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<TaskLobby recentTasks={[]} onStart={onStart} onOpenReport={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /自定义游戏/ }))
    await user.type(screen.getByLabelText('游戏名称'), '星海测试服')
    await user.type(screen.getByLabelText('版本或更新内容'), '2.4 夏季活动')
    await user.click(screen.getByRole('button', { name: '启动全球分析' }))

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        game: expect.objectContaining({ name: '星海测试服' }),
        version: expect.objectContaining({ title: '2.4 夏季活动' }),
        isGeneric: true,
      }),
    )
  })
})
