import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createGroundedTestPreset } from '../../test/groundedFixture'
import { RegionalPulse, deriveRegionalVoices } from './RegionalPulse'

describe('RegionalPulse', () => {
  it('contrasts verified player voices from China, Japan and Western markets', () => {
    const evidence = createGroundedTestPreset().evidence
    const voices = deriveRegionalVoices(evidence)

    expect(voices.map(({ region, focus }) => ({ region, focus }))).toEqual([
      { region: 'CN', focus: '探索体验' },
      { region: 'JP', focus: '角色表现' },
      { region: 'WEST', focus: '剧情节奏' },
    ])

    render(<RegionalPulse evidence={evidence} regionalStatus="running" />)

    expect(screen.getByRole('region', { name: '实时地区声音对比' })).toBeInTheDocument()
    expect(screen.getByText('地区 Agent 正在比对')).toBeInTheDocument()

    const china = screen.getByTestId('regional-voice-CN')
    expect(within(china).getByRole('img', { name: '中国旗帜' })).toBeInTheDocument()
    expect(within(china).getByText('探索体验')).toBeInTheDocument()
    expect(within(china).getByText('测试夹具：页面讨论了版本探索体验。')).toBeInTheDocument()

    const japan = screen.getByTestId('regional-voice-JP')
    expect(within(japan).getByRole('img', { name: '日本旗帜' })).toBeInTheDocument()
    expect(within(japan).getByText('角色表现')).toBeInTheDocument()

    const west = screen.getByTestId('regional-voice-WEST')
    expect(within(west).getByRole('img', { name: '欧美地区旗帜：美国与欧盟' })).toBeInTheDocument()
    expect(within(west).getByText('剧情节奏')).toBeInTheDocument()
    expect(within(west).getByText('测试夹具：讨论剧情节奏的公开页面。')).toBeInTheDocument()

    expect(screen.getByText('中国：探索体验')).toBeInTheDocument()
    expect(screen.getByText('日本：角色表现')).toBeInTheDocument()
    expect(screen.getByText('欧美：剧情节奏')).toBeInTheDocument()
  })

  it('shows an explicit evidence gap instead of inventing a regional opinion', () => {
    const chinaEvidence = createGroundedTestPreset().evidence.filter((item) => item.region === 'CN')

    render(<RegionalPulse evidence={chinaEvidence} regionalStatus="queued" />)

    expect(within(screen.getByTestId('regional-voice-JP')).getByText('等待日本真实证据')).toBeInTheDocument()
    expect(within(screen.getByTestId('regional-voice-WEST')).getByText('等待欧美真实证据')).toBeInTheDocument()
    expect(screen.getByText('正在补齐地区证据')).toBeInTheDocument()
    expect(screen.getByText('已形成 1 / 3 个地区视角')).toBeInTheDocument()
  })
})
