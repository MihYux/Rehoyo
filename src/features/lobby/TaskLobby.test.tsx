import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskLobby } from './TaskLobby'

describe('TaskLobby', () => {
  afterEach(() => {
    delete window.rehoyoDesktop
  })

  it('presents the ReHoYo brand and three flagship games', () => {
    render(<TaskLobby recentTasks={[]} onStart={vi.fn()} onOpenReport={vi.fn()} />)

    expect(screen.getByRole('img', { name: 'ReHoYo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /原神/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /崩坏：星穹铁道/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /绝区零/ })).toBeInTheDocument()
  })

  it('defaults to real public-web research when the desktop agent is configured', async () => {
    const onStart = vi.fn()
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(async () => ({ configured: true, model: 'glm-5.2', retrieval: 'BigModel Web Search + public RSS', searchEndpoint: 'open.bigmodel.cn' })),
        run: vi.fn(),
        onEvent: vi.fn(() => () => {}),
      },
    }
    const user = userEvent.setup()
    render(<TaskLobby recentTasks={[]} onStart={onStart} onOpenReport={vi.fn()} />)

    expect(await screen.findByText('真实公开网络研究')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '启动真实研究' }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ game: expect.objectContaining({ name: '原神' }) }), 'live')
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
