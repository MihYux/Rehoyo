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
      connection: {
        getStatus: vi.fn(async () => ({
          configured: true,
          ai: { configured: true, provider: 'bigmodel' as const, endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4', model: 'glm-5.2' as const, persistence: 'encrypted' as const },
          search: { configured: true, provider: 'openai' as const, endpoint: 'https://api.openai.com/v1', model: 'gpt-5.6' as const, persistence: 'encrypted' as const },
          missing: [],
        })),
        save: vi.fn(),
        clear: vi.fn(),
        invalidate: vi.fn(),
      },
      research: {
        getStatus: vi.fn(async () => ({ configured: true, model: 'glm-5.2', retrieval: 'verified test retrieval', searchEndpoint: 'open.bigmodel.cn' })),
        run: vi.fn(() => new Promise<never>(() => undefined)),
        onEvent: vi.fn(() => () => undefined),
      },
    }
  })

  it('renders the release project lobby at the root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /从看见全球玩家/ })).toBeInTheDocument()
  })

  it('redirects an unknown running task back to the lobby', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks/missing/run']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /从看见全球玩家/ })).toBeInTheDocument()
  })

  it('opens the version release brief from the primary action', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /创建版本发行项目/ }))

    expect(await screen.findByRole('heading', { name: '这次要发行什么？' })).toBeInTheDocument()
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

  it('keeps desktop release navigation in the URL hash for packaged file loading', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /创建版本发行项目/ }))

    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toBe('#/projects/new')
  })

  it('keeps anchored product-path links on the release lobby', async () => {
    window.location.hash = '#/'
    render(<App />)

    expect(await screen.findByRole('link', { name: '产品路径' })).toHaveAttribute('href', '#release-flow')
  })
})
