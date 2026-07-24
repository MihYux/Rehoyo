import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReleaseProjectForm } from './ReleaseProjectForm'

describe('release project brief', () => {
  it('collects new version content through spacious sections and creates a brief project', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<ReleaseProjectForm onCreate={onCreate} />)

    expect(screen.getAllByRole('button', { name: /选择游戏/ })).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: /选择游戏 崩坏：星穹铁道/ }))
    await user.type(screen.getByLabelText('版本号'), '3.8')
    await user.type(screen.getByLabelText('更新名称'), '再会，匹诺康尼')
    await user.type(screen.getByLabelText('预计上线日期'), '2026-09-10')
    await user.selectOptions(screen.getByLabelText('首要发行目标'), 'recall')
    await user.selectOptions(screen.getByLabelText('核心卖点类型'), 'character')
    await user.type(screen.getByLabelText('核心卖点名称'), '三月七全新形态')
    await user.type(screen.getByLabelText('核心卖点说明'), '围绕旅途重逢展开的角色内容。')
    await user.click(screen.getByLabelText('角色设定与审核模板'))
    await user.click(screen.getByLabelText('允许角色关系发行灰度预演'))
    await user.click(screen.getByRole('button', { name: '开始区域研究' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      game: '崩坏：星穹铁道',
      version: '3.8',
      updateName: '再会，匹诺康尼',
      status: 'brief_draft',
      brief: {
        primaryObjective: 'recall',
        allowCharacterRelationshipPilot: true,
      },
    })
  })
})
