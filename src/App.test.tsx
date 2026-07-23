import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App, { AppRoutes } from './App'
import { saveCompletedTask } from './domain/storage'
import { createGroundedCompletedTask } from './test/groundedFixture'

vi.mock('./features/report/ReportDashboard', () => ({
  ReportDashboard: ({ onOpenAdvisor }: { onOpenAdvisor: () => void }) => (
    <div><h1>全球玩家洞察报告</h1><button type="button" onClick={onOpenAdvisor}>打开 AI 游戏顾问</button></div>
  ),
}))

vi.mock('./features/advisor/AdvisorWorkspace', () => ({
  AdvisorWorkspace: () => <h1>版本决策顾问</h1>,
}))

describe('App routes', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    window.location.hash = ''
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(async () => ({ configured: true, model: 'glm-5.2', retrieval: 'verified test retrieval', searchEndpoint: 'open.bigmodel.cn' })),
        run: vi.fn(() => new Promise<never>(() => undefined)),
        onEvent: vi.fn(() => () => undefined),
      },
    }
  })

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

    await user.click(await screen.findByRole('button', { name: '启动真实研究' }))

    expect(await screen.findByRole('heading', { name: 'Agent 协作空间' })).toBeInTheDocument()
  })

  it('restores a completed report and unlocks the grounded advisor', async () => {
    const user = userEvent.setup()
    const task = createGroundedCompletedTask()
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

  it('keeps desktop navigation in the URL hash for packaged file loading', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '启动真实研究' }))

    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toMatch(/^#\/tasks\/[^/]+\/run$/)
  })

  it('keeps the desktop route hash while navigating lobby sections', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/'
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Agent 团队' }))

    expect(window.location.hash).toBe('#/')
  })
})
