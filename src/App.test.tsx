import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { analysisPresets } from './data/presets'
import { advanceToElapsedTime, startTask } from './domain/engine'
import { saveCompletedTask } from './domain/storage'

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echarts" />,
}))

describe('App routes', () => {
  beforeEach(() => localStorage.clear())

  it('renders the task lobby at the root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /听见全球玩家/ })).toBeInTheDocument()
  })

  it('redirects an unknown running task back to the lobby', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks/missing/run']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /听见全球玩家/ })).toBeInTheDocument()
  })

  it('starts a preset task and enters the agent workspace', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '启动全球分析' }))

    expect(await screen.findByRole('heading', { name: 'Agent 协作空间' })).toBeInTheDocument()
  })

  it('restores a completed report and unlocks the grounded advisor', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    const task = advanceToElapsedTime(preset, startTask(preset, 1_000), preset.durationMs)
    saveCompletedTask(task)

    render(
      <MemoryRouter initialEntries={[`/tasks/${task.id}/report?tab=overview`]}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '全球玩家洞察报告' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /打开 AI 游戏顾问/ }))
    expect(await screen.findByRole('heading', { name: '版本决策顾问' })).toBeInTheDocument()
  })
})
