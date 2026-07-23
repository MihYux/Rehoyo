import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { analysisPresets } from '../../data/presets'
import { advanceToElapsedTime, startTask } from '../../domain/engine'
import { ReportDashboard } from './ReportDashboard'

vi.mock('echarts-for-react/esm/core', () => ({
  default: ({ option }: { option: unknown }) => <div data-testid="echarts" data-option={JSON.stringify(option)} />,
}))

describe('ReportDashboard', () => {
  it('moves between global, regional, evidence and strategy views', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    const task = advanceToElapsedTime(preset, startTask(preset, 1_000), preset.durationMs)

    render(<ReportDashboard preset={preset} task={task} onOpenAdvisor={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '全球玩家洞察报告' })).toBeInTheDocument()
    expect(screen.getAllByText('1,284').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '地区差异' }))
    expect(screen.getByRole('heading', { name: '中国玩家' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '日本玩家' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '争议与证据' }))
    await user.selectOptions(screen.getByLabelText('地区筛选'), 'JP')
    expect(screen.getAllByText(/演示证据/).length).toBeGreaterThan(0)
    expect(screen.queryByText('旅行者_042')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '策略建议' }))
    expect(screen.getByText('重写角色机制传播材料')).toBeInTheDocument()
  })

  it('labels live evidence as real and exposes its verifiable source URL', async () => {
    const user = userEvent.setup()
    const base = analysisPresets[0]
    const livePreset = {
      ...base,
      dataMode: 'live' as const,
      evidence: base.evidence.map((item, index) => ({
        ...item,
        synthetic: false,
        title: `真实公开页面 ${index + 1}`,
        url: `https://example.com/evidence/${index + 1}`,
      })),
      report: { ...base.report, sampleCount: base.evidence.length },
    }
    const task = { ...advanceToElapsedTime(livePreset, startTask(livePreset, 1_000), livePreset.durationMs), presetSnapshot: livePreset }

    render(<ReportDashboard preset={livePreset} task={task} onOpenAdvisor={vi.fn()} />)

    expect(screen.getAllByText(/实时公开网页/).length).toBeGreaterThan(0)
    expect(screen.queryByText('演示数据快照')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '争议与证据' }))
    expect(screen.getAllByText(/真实公开页面/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/https:\/\/example.com\/evidence\//).length).toBeGreaterThan(0)
  })
})
