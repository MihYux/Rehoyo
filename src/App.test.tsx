import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from './App'

describe('App routes', () => {
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
})
