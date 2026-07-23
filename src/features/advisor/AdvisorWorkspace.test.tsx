import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { analysisPresets } from '../../data/presets'
import { AdvisorWorkspace } from './AdvisorWorkspace'

describe('AdvisorWorkspace', () => {
  it('answers preset questions and exposes cited evidence', async () => {
    const user = userEvent.setup()
    const preset = analysisPresets[0]
    render(<AdvisorWorkspace preset={preset} onBackToReport={vi.fn()} onOpenEvidence={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '为什么欧美玩家不喜欢这个角色？' }))

    expect(screen.getByText(/宣传呈现的战斗想象/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gi-west-02/i })).toBeInTheDocument()
  })
})
