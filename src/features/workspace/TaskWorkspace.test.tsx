import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveResearchEventPayload } from '../../desktop/bridge'
import { startTask } from '../../domain/engine'
import { createGroundedTestPreset } from '../../test/groundedFixture'
import { TaskWorkspace } from './TaskWorkspace'

describe('TaskWorkspace', () => {
  afterEach(() => {
    delete window.rehoyoDesktop
  })

  it('streams only verified Electron evidence into the Agent browsers and inspector', async () => {
    const preset = createGroundedTestPreset()
    const evidence = preset.evidence[0]
    const sourceEvent = {
      ...preset.events[1],
      evidenceIds: [evidence.id],
      evidenceRecords: [evidence],
    }
    let listener: ((payload: LiveResearchEventPayload) => void) | undefined
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(),
        onEvent: vi.fn((callback) => { listener = callback; return () => { listener = undefined } }),
        run: vi.fn(async (request) => {
          listener?.({ runId: request.runId, event: sourceEvent })
          return new Promise<never>(() => undefined)
        }),
      },
    }
    const user = userEvent.setup()

    render(<TaskWorkspace preset={preset} initialTask={startTask(preset, 1_000)} onComplete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Agent 协作空间' })).toBeInTheDocument()
    expect(screen.getAllByLabelText(/Agent 迷你浏览器/)).toHaveLength(4)
    expect((await screen.findAllByText(evidence.url)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('真实网页').length).toBeGreaterThan(0)
    expect(screen.queryByText('演示快照')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /社区研究 Agent/ }))
    expect(await screen.findByRole('heading', { name: 'Agent 任务检查器' })).toBeInTheDocument()
    expect(screen.getByText(/只接收带可验证 URL/)).toBeInTheDocument()
  })

  it('completes only after the returned preset passes the real-evidence integrity gate', async () => {
    const preset = createGroundedTestPreset()
    let listener: ((payload: LiveResearchEventPayload) => void) | undefined
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(),
        onEvent: vi.fn((callback) => { listener = callback; return () => { listener = undefined } }),
        run: vi.fn(async (request) => {
          for (const event of preset.events) listener?.({ runId: request.runId, event })
          return { ok: true as const, preset }
        }),
      },
    }
    const onComplete = vi.fn()

    render(<TaskWorkspace preset={preset} initialTask={startTask(preset, 1_000)} onComplete={onComplete} />)

    expect(await screen.findByText('REAL WEB DATA · NO SYNTHETIC FALLBACK')).toBeInTheDocument()
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', dataMode: 'live', presetSnapshot: preset }),
      preset,
    ), { timeout: 2_500 })
  })

  it('stops instead of displaying an unverified evidence record', async () => {
    const preset = createGroundedTestPreset()
    const invalidEvidence = { ...preset.evidence[0], url: '', synthetic: true }
    let listener: ((payload: LiveResearchEventPayload) => void) | undefined
    window.rehoyoDesktop = {
      isElectron: true,
      platform: 'win32',
      research: {
        getStatus: vi.fn(),
        onEvent: vi.fn((callback) => { listener = callback; return () => { listener = undefined } }),
        run: vi.fn(async (request) => {
          listener?.({
            runId: request.runId,
            event: { ...preset.events[1], evidenceRecords: [invalidEvidence] } as unknown as LiveResearchEventPayload['event'],
          })
          return { ok: true as const, preset }
        }),
      },
    }
    const onComplete = vi.fn()

    render(<TaskWorkspace preset={preset} initialTask={startTask(preset, 1_000)} onComplete={onComplete} />)

    expect(await screen.findByText(/缺少 HTTPS URL/)).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.queryByText(invalidEvidence.excerptOriginal)).not.toBeInTheDocument()
  })
})
