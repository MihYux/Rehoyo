import { describe, expect, it, vi } from 'vitest'
import { createCoveragePolicy } from '../../electron/research-policy.mjs'
import { runRegionalResearchAgent } from '../../electron/research-agent-loop.mjs'

function evidence(id: string) {
  return {
    id,
    runId: 'run-dynamic',
    role: 'player',
    region: 'JP',
    source: 'Niconico',
    url: `https://www.nicovideo.jp/watch/${id}`,
    excerptOriginal: `実際のプレイヤーコメント ${id}`,
    synthetic: false,
  }
}

function toolMessage(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [{
      id: `call-${name}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    }],
  }
}

describe('AI-directed regional research loop', () => {
  it('lets the model change its localized query after observing sparse results', async () => {
    const decisions = [
      toolMessage('search_web', {
        query: '崩壊スターレイル 2.0 感想',
        language: 'ja-JP',
        purpose: '最初の日本プレイヤー反応を探す',
      }),
      toolMessage('search_web', {
        query: 'ピノコニー プレイヤー 評価',
        language: 'ja-JP',
        purpose: '別の語彙で日本プレイヤー反応を探す',
      }),
      toolMessage('finish_region', { reason: '地域サンプル目標を達成' }),
    ]
    const model = { nextAction: vi.fn(async (_context: unknown) => decisions.shift()) }
    const searchWeb = vi.fn(async (_action) => ({
      evidence: searchWeb.mock.calls.length === 1 ? [] : [evidence('sm-1'), evidence('sm-2')],
      inspected: [{ id: `attempt-${searchWeb.mock.calls.length}`, status: 'completed', region: 'JP', url: `https://source-${searchWeb.mock.calls.length}.example/result` }],
    }))

    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      policy: createCoveragePolicy({ currentRunId: 'run-dynamic', evidencePerRegion: 2, globalDomains: 1, requestedRegions: ['JP'] }),
      model,
      tools: { searchWeb },
    })

    expect(searchWeb.mock.calls.map(([action]) => action.query)).toEqual([
      '崩壊スターレイル 2.0 感想',
      'ピノコニー プレイヤー 評価',
    ])
    const secondContext = model.nextAction.mock.calls[1]?.[0] as { history: Array<Record<string, unknown>> }
    expect(secondContext.history[0]).toMatchObject({ result: { evidenceAdded: 0 } })
    expect(result).toMatchObject({ status: 'complete', region: 'JP' })
    expect(result.evidence).toHaveLength(2)
  })

  it('rejects an early finish action and continues until the regional quota is real', async () => {
    const decisions = [
      toolMessage('finish_region', { reason: '提前完成' }),
      toolMessage('search_web', {
        query: 'HSR 2.0 player comments',
        language: 'ja-JP',
        purpose: '寻找真实玩家评论',
      }),
      toolMessage('finish_region', { reason: '已取得真实样本' }),
    ]
    const events: Array<{ kind: string; message: string }> = []
    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      policy: createCoveragePolicy({ currentRunId: 'run-dynamic', evidencePerRegion: 1, globalDomains: 1, requestedRegions: ['JP'] }),
      model: { nextAction: vi.fn(async () => decisions.shift()) },
      tools: { searchWeb: vi.fn(async () => ({ evidence: [evidence('sm-real')], inspected: [] })) },
      onEvent: (event) => events.push(event),
    })

    expect(events.some((event) => event.kind === 'action_rejected' && event.message.includes('配额'))).toBe(true)
    expect(result.status).toBe('complete')
  })

  it('blocks repeated actions instead of looping forever', async () => {
    const repeated = toolMessage('search_web', {
      query: 'same query',
      language: 'ja-JP',
      purpose: 'find comments',
    })
    await expect(runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      policy: createCoveragePolicy({ currentRunId: 'run-dynamic', evidencePerRegion: 1, requestedRegions: ['JP'] }),
      model: { nextAction: vi.fn(async () => repeated) },
      tools: { searchWeb: vi.fn(async () => ({ evidence: [], inspected: [] })) },
      maxSteps: 8,
      maxRepeatedActions: 2,
    })).resolves.toMatchObject({ status: 'incomplete', reason: expect.stringMatching(/重复/) })
  })
})
