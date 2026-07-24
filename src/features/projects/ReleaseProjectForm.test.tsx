import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReleaseProjectForm } from './ReleaseProjectForm'

describe('release project brief', () => {
  it('prefills a complete judge demo and creates a project without requiring text entry', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<ReleaseProjectForm onCreate={onCreate} />)

    const gameOptions = screen.getAllByRole('button', { name: /选择游戏/ })
    expect(gameOptions).toHaveLength(3)
    expect(gameOptions[0]).toHaveAccessibleName('选择游戏 崩坏：星穹铁道')
    expect(gameOptions[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('评委演示预设已填好')
    expect(screen.getByLabelText('版本号')).toHaveValue('2.0')
    expect(screen.getByLabelText('预计上线日期')).toHaveValue('2024-02-06')
    expect(screen.getByLabelText('更新名称')).toHaveValue('假如在午夜入梦')
    expect(screen.getByLabelText('核心卖点名称')).toHaveValue('黑天鹅与匹诺康尼故事')
    expect(screen.getByLabelText('角色设定与审核模板')).toBeChecked()
    expect(screen.getByLabelText('允许角色关系发行灰度预演')).toBeChecked()
    await user.click(screen.getByRole('button', { name: '开始区域研究' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      game: '崩坏：星穹铁道',
      version: '2.0',
      updateName: '假如在午夜入梦',
      status: 'brief_draft',
      brief: {
        primaryObjective: 'recall',
        allowCharacterRelationshipPilot: true,
      },
    })
  })

  it('switches the entire preset with the game while keeping fields editable', async () => {
    const user = userEvent.setup()
    render(<ReleaseProjectForm onCreate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '选择游戏 原神' }))
    expect(screen.getByLabelText('版本号')).toHaveValue('5.0')
    expect(screen.getByLabelText('更新名称')).toHaveValue('荣花与炎日之途')
    expect(screen.getByLabelText('核心卖点名称')).toHaveValue('纳塔全新区域与角色故事')

    await user.clear(screen.getByLabelText('更新名称'))
    await user.type(screen.getByLabelText('更新名称'), '评委自定义版本名')
    expect(screen.getByLabelText('更新名称')).toHaveValue('评委自定义版本名')

    await user.click(screen.getByRole('button', { name: '恢复预设' }))
    expect(screen.getByLabelText('更新名称')).toHaveValue('荣花与炎日之途')
  })
})
