import { describe, expect, it, vi } from 'vitest'
import { createCoveragePolicy } from '../../electron/research-policy.mjs'
import { runRegionalResearchAgent } from '../../electron/research-agent-loop.mjs'
import {
  executeResearchAction,
  getResearchToolSchemas,
  parseResearchToolCall,
  validateResearchAction,
} from '../../electron/research-tools.mjs'

const ACTION_NAMES = [
  'search_web',
  'open_page',
  'scroll_page',
  'click_page',
  'type_page',
  'extract_comments',
  'fetch_supplement',
  'close_page',
  'finish_region',
]

function toolMessage(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [{
      id: `call-${name}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    }],
  }
}

function policy() {
  return createCoveragePolicy({
    currentRunId: 'run-protocol',
    requestedRegions: ['JP'],
    evidencePerRegion: 1,
    globalDomains: 1,
  })
}

describe('canonical research action protocol', () => {
  it('generates all nine strict GLM function schemas from one registry', () => {
    const schemas = getResearchToolSchemas()

    expect(schemas.map((schema) => schema.function.name)).toEqual(ACTION_NAMES)
    for (const schema of schemas) {
      expect(schema).toMatchObject({
        type: 'function',
        function: {
          strict: true,
          parameters: { type: 'object', additionalProperties: false },
        },
      })
    }
  })

  it('parses and validates GLM message.tool_calls without trusting message.content', () => {
    expect(parseResearchToolCall(toolMessage('search_web', {
      query: '崩坏：星穹铁道 2.0 玩家评价',
      language: 'zh-CN',
      purpose: '寻找版本更新后的玩家原始反馈',
    }))).toEqual({
      type: 'search_web',
      query: '崩坏：星穹铁道 2.0 玩家评价',
      language: 'zh-CN',
      purpose: '寻找版本更新后的玩家原始反馈',
    })

    expect(() => parseResearchToolCall({
      content: '{"type":"finish_region","reason":"quota reached"}',
    })).toThrow(/tool call/i)
  })

  it('performs at most one known arguments-wrapper repair', () => {
    const onceWrapped = {
      tool_calls: [{
        type: 'function',
        function: {
          name: 'finish_region',
          arguments: JSON.stringify({ arguments: { reason: '区域证据目标已达到' } }),
        },
      }],
    }
    const twiceWrapped = {
      tool_calls: [{
        type: 'function',
        function: {
          name: 'finish_region',
          arguments: JSON.stringify({ arguments: { arguments: { reason: '区域证据目标已达到' } } }),
        },
      }],
    }

    expect(parseResearchToolCall(onceWrapped)).toEqual({ type: 'finish_region', reason: '区域证据目标已达到' })
    expect(() => parseResearchToolCall(twiceWrapped)).toThrow(/arguments|reason/i)
  })

  it.each([
    ['search_web', { query: 'HSR 2.0 player feedback', language: 'en-US', purpose: 'find player comments' }],
    ['open_page', { candidateId: 'candidate-1', reason: 'verify candidate' }],
    ['scroll_page', { pageId: 'page-1', direction: 'down', amount: 1_200 }],
    ['click_page', { pageId: 'page-1', selector: '[data-more]', reason: 'expand comments' }],
    ['type_page', { pageId: 'page-1', selector: 'input[type=search]', value: 'HSR 2.0', reason: 'search within site' }],
    ['extract_comments', { pageId: 'page-1', selectors: ['.comment', '[data-comment]'] }],
    ['fetch_supplement', { pageId: 'page-1', reason: 'load matching public RSS body' }],
    ['close_page', { pageId: 'page-1', reason: 'candidate processed' }],
    ['finish_region', { reason: 'regional quota reached' }],
  ])('validates %s with its action-specific fields', (type, args) => {
    expect(validateResearchAction({ type, ...args })).toMatchObject({ type, ...args })
  })

  it('dispatches each executable action through the registry mapping', async () => {
    const tools = {
      searchWeb: vi.fn(async () => ({ evidence: [], inspected: [] })),
      openPage: vi.fn(async () => ({ pages: [{ id: 'page-1' }] })),
      scrollPage: vi.fn(async () => ({})),
      clickPage: vi.fn(async () => ({})),
      typePage: vi.fn(async () => ({})),
      extractComments: vi.fn(async () => ({ evidence: [{ id: 'e-1' }] })),
      fetchSupplement: vi.fn(async () => ({})),
      closePage: vi.fn(async () => ({})),
    }

    for (const [type, args] of [
      ['search_web', { query: 'HSR 2.0 player feedback', language: 'en-US', purpose: 'find comments' }],
      ['open_page', { candidateId: 'candidate-1', reason: 'verify' }],
      ['scroll_page', { pageId: 'page-1', direction: 'down', amount: 900 }],
      ['click_page', { pageId: 'page-1', selector: '.more', reason: 'expand' }],
      ['type_page', { pageId: 'page-1', selector: 'input', value: 'HSR', reason: 'search' }],
      ['extract_comments', { pageId: 'page-1', selectors: ['.comment'] }],
      ['fetch_supplement', { pageId: 'page-1', reason: 'complete body' }],
      ['close_page', { pageId: 'page-1', reason: 'done' }],
    ] as const) {
      await executeResearchAction(validateResearchAction({ type, ...args }), tools)
    }

    for (const method of Object.values(tools)) expect(method).toHaveBeenCalledOnce()
  })
})

describe('bounded regional action loop', () => {
  it('stops after two consecutive invalid tool calls', async () => {
    const model = {
      nextAction: vi.fn()
        .mockResolvedValueOnce({ content: '{"type":"search_web"}' })
        .mockResolvedValueOnce(toolMessage('unknown_action', {})),
    }

    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0' },
      policy: policy(),
      model,
      tools: {},
    })

    expect(result).toMatchObject({ status: 'incomplete', invalidActions: 2 })
    expect(result.reason).toMatch(/连续.*2|invalid.*2/i)
    expect(model.nextAction).toHaveBeenCalledTimes(2)
  })

  it('stops after four cumulative invalid tool calls even when valid actions reset the consecutive count', async () => {
    const invalid = { content: '{"type":"search_web"}' }
    const valid = toolMessage('search_web', {
      query: 'HSR 2.0 player feedback',
      language: 'en-US',
      purpose: 'find comments',
    })
    const decisions = [invalid, valid, invalid, valid, invalid, valid, invalid]
    const model = { nextAction: vi.fn(async () => decisions.shift()) }

    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0' },
      policy: policy(),
      model,
      tools: { searchWeb: vi.fn(async () => ({ evidence: [], inspected: [] })) },
    })

    expect(result).toMatchObject({ status: 'incomplete', invalidActions: 4 })
    expect(result.reason).toMatch(/累计.*4|invalid.*4/i)
    expect(model.nextAction).toHaveBeenCalledTimes(7)
  })

  it('enforces the injected 45 minute total deadline', async () => {
    let timestamp = 0
    const model = {
      nextAction: vi.fn(async () => {
        timestamp = 45 * 60_000
        return toolMessage('search_web', {
          query: 'HSR 2.0 player feedback',
          language: 'en-US',
          purpose: 'find comments',
        })
      }),
    }

    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0' },
      policy: policy(),
      model,
      tools: { searchWeb: vi.fn(async () => ({ evidence: [], inspected: [] })) },
      clock: { now: () => timestamp },
    })

    expect(result).toMatchObject({ status: 'incomplete' })
    expect(result.reason).toMatch(/45.*分钟|deadline/i)
  })

  it('bounds a model request with requestTimeoutMs', async () => {
    const result = await runRegionalResearchAgent({
      region: 'JP',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0' },
      policy: policy(),
      model: { nextAction: vi.fn(() => new Promise(() => {})) },
      tools: {},
      maxSteps: 1,
      requestTimeoutMs: 5,
    })

    expect(result).toMatchObject({ status: 'incomplete' })
    expect(result.history[0]?.result?.error).toMatch(/timeout/i)
  })
})
