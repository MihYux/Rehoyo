import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createGroundedCompletedTask, createGroundedTestPreset } from '../../test/groundedFixture'
import { ReportDashboard } from './ReportDashboard'

vi.mock('echarts-for-react/esm/core', () => ({
  default: ({ option }: { option: unknown }) => <div data-testid="echarts" data-option={JSON.stringify(option)} />,
}))

describe('ReportDashboard', () => {
  it('moves between real global, regional, evidence and strategy views', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    const task = createGroundedCompletedTask(preset)

    render(<ReportDashboard preset={preset} task={task} onOpenAdvisor={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '全球玩家洞察报告' })).toBeInTheDocument()
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '地区差异' }))
    expect(screen.getByRole('heading', { name: '中国玩家' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '日本玩家' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '争议与证据' }))
    await user.selectOptions(screen.getByLabelText('地区筛选'), 'JP')
    expect(screen.getAllByText(/实时公开网页/).length).toBeGreaterThan(0)
    expect(screen.getByText('https://www.nicovideo.jp/watch/smTEST001')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '策略建议' }))
    expect(screen.getAllByText('测试建议').length).toBeGreaterThan(0)
  })

  it('shows an evidence gap instead of inventing controversy or strategy content', async () => {
    const user = userEvent.setup()
    const preset = createGroundedTestPreset()
    const sparsePreset = {
      ...preset,
      report: { ...preset.report, riskLevel: 'low' as const, controversies: [], recommendations: [] },
    }

    render(<ReportDashboard preset={sparsePreset} task={createGroundedCompletedTask(sparsePreset)} onOpenAdvisor={vi.fn()} />)
    expect(screen.getByText('当前证据不足以确认争议')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '策略建议' }))
    expect(screen.getByText('当前不生成无证据决策简报')).toBeInTheDocument()
  })
})
