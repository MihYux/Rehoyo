import { describe, expect, it, vi } from 'vitest'
import { runAdaptiveResearchChain } from '../../electron/adaptive-research-chain.mjs'

function fixedRouter(route = 'openai_search') {
  const snapshot = {
    region: 'CN', phase: 'warmup', revision: 0, selections: 1, attempts: 0,
    weights: { openai_search: 50, bigmodel_search: 25, webfetch: 25 },
    stats: {
      openai_search: { attempts: 0, successfulAttempts: 0, successRate: 0, candidates: 0, evidence: 0 },
      bigmodel_search: { attempts: 0, successfulAttempts: 0, successRate: 0, candidates: 0, evidence: 0 },
      webfetch: { attempts: 0, successfulAttempts: 0, successRate: 0, candidates: 0, evidence: 0 },
    },
    routes: {},
  }
  return {
    select: vi.fn(() => ({ route, ...snapshot })),
    record: vi.fn(() => ({ route, successful: true, recordedAttempt: true, authRequired: null, circuitState: 'closed', snapshot })),
    getSnapshot: vi.fn(() => snapshot),
  }
}

function browserFake(callOrder: string[]) {
  return {
    start: vi.fn(async () => { callOrder.push('browser:start') }),
    open: vi.fn(async (candidate: { url: string }) => {
      callOrder.push('browser:open')
      return { pageId: 'page-1', status: 'completed', title: 'Player thread', text: `visible ${candidate.url}`, statusCode: 200 }
    }),
    scroll: vi.fn(async () => { callOrder.push('browser:scroll') }),
    extractVisibleComments: vi.fn(async () => {
      callOrder.push('browser:extract')
      return [
        'I love Penacony, but the story pacing is confusing.',
        'Penacony is beautiful.',
      ]
    }),
    closePage: vi.fn(async () => { callOrder.push('browser:close-page') }),
    close: vi.fn(async () => { callOrder.push('browser:close') }),
  }
}

describe('adaptive real-time research chain', () => {
  it('starts Playwright first and enforces search -> browser -> BigModel -> same-URL WebFetch -> BigModel', async () => {
    const calls: string[] = []
    const browser = browserFake(calls)
    let judged = 0
    const result = await runAdaptiveResearchChain({
      runId: 'run-chain',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      regions: ['CN'],
      evidencePerRegion: 1,
      globalDomainTarget: 1,
      maxAttemptsPerRegion: 2,
      router: fixedRouter(),
      browser,
      planner: { nextAction: vi.fn(async () => ({ type: 'search_web', query: '崩铁 2.0 玩家 评价', language: 'zh-CN', purpose: '寻找玩家原话' })) },
      providers: {
        openai_search: vi.fn(async () => {
          calls.push('provider:openai')
          return { candidates: [{ id: 'candidate-1', title: 'Player thread', url: 'https://example.com/player-thread', source: 'Example' }] }
        }),
        bigmodel_search: vi.fn(),
        webfetch: vi.fn(),
      },
      judgePage: vi.fn(async ({ supplement }: { supplement?: string }) => {
        judged += 1
        calls.push(`bigmodel:judge:${supplement ? 'supplemented' : 'browser'}`)
        if (!supplement) return { relevant: true, containsPlayerExpression: false, needsSupplement: true, expressions: [] }
        return {
          relevant: true,
          containsPlayerExpression: true,
          needsSupplement: false,
          expressions: [{ original: '我喜欢匹诺康尼，但故事节奏让人困惑。', translatedZh: '我喜欢匹诺康尼，但故事节奏让人困惑。', author: '公开玩家', sentiment: 'neutral', topics: ['剧情节奏'] }],
        }
      }),
      fetchSupplement: vi.fn(async ({ url }: { url: string }) => {
        calls.push('webfetch:supplement')
        expect(url).toBe('https://example.com/player-thread')
        return { url, text: '同一公开页面通过 RSS/API 返回的完整正文：我喜欢匹诺康尼，但故事节奏让人困惑。' }
      }),
    })

    expect(calls).toEqual([
      'browser:start',
      'provider:openai',
      'browser:open',
      'browser:scroll',
      'browser:extract',
      'bigmodel:judge:browser',
      'webfetch:supplement',
      'bigmodel:judge:supplemented',
      'browser:close-page',
      'browser:close',
    ])
    expect(judged).toBe(2)
    expect(result.status).toBe('complete')
    expect(result.evidence).toEqual([expect.objectContaining({
      runId: 'run-chain',
      region: 'CN',
      url: 'https://example.com/player-thread',
      excerptOriginal: '我喜欢匹诺康尼，但故事节奏让人困惑。',
      synthetic: false,
      role: 'player',
    })])
    expect(result.coverage.uniqueDomains).toBe(1)
  })

  it('never turns search summaries, Wiki context, or irrelevant pages into player evidence', async () => {
    const calls: string[] = []
    const result = await runAdaptiveResearchChain({
      runId: 'run-empty',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      regions: ['JP'],
      evidencePerRegion: 1,
      globalDomainTarget: 1,
      maxAttemptsPerRegion: 1,
      router: fixedRouter('openai_search'),
      browser: browserFake(calls),
      planner: { nextAction: vi.fn(async () => ({ type: 'search_web', query: 'スターレイル 2.0 感想', language: 'ja-JP', purpose: 'プレイヤーの声' })) },
      providers: {
        openai_search: vi.fn(async () => ({
          modelText: 'The model says players liked it.',
          candidates: [{ id: 'wiki', title: 'Background', url: 'https://en.wikipedia.org/wiki/Honkai:_Star_Rail', source: 'Wikipedia' }],
        })),
        bigmodel_search: vi.fn(),
        webfetch: vi.fn(),
      },
      judgePage: vi.fn(async () => ({ relevant: true, containsPlayerExpression: false, needsSupplement: false, expressions: [] })),
      fetchSupplement: vi.fn(),
    })

    expect(result.status).toBe('incomplete')
    expect(result.evidence).toHaveLength(0)
    expect(result.coverage.regions.JP.evidence).toBe(0)
  })

  it('pauses only the failed provider on 401 and resumes the same run after credentials are updated', async () => {
    const calls: string[] = []
    let attempts = 0
    const waitForReauthentication = vi.fn(async (provider: string) => { calls.push(`reauth:${provider}`) })
    const result = await runAdaptiveResearchChain({
      runId: 'run-auth',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      regions: ['WEST'],
      evidencePerRegion: 1,
      globalDomainTarget: 1,
      maxAttemptsPerRegion: 2,
      router: fixedRouter('openai_search'),
      browser: browserFake(calls),
      planner: { nextAction: vi.fn(async () => ({ type: 'search_web', query: 'HSR 2.0 player comments', language: 'en-US', purpose: 'player feedback' })) },
      providers: {
        openai_search: vi.fn(async () => {
          attempts += 1
          if (attempts === 1) {
            const error = Object.assign(new Error('expired'), { name: 'ProviderAuthenticationError', provider: 'openai', status: 401 })
            throw error
          }
          return { candidates: [{ id: 'thread', title: 'Thread', url: 'https://reddit.com/r/HonkaiStarRail/comments/real', source: 'Reddit' }] }
        }),
        bigmodel_search: vi.fn(),
        webfetch: vi.fn(),
      },
      judgePage: vi.fn(async () => ({
        relevant: true,
        containsPlayerExpression: true,
        expressions: [{ original: 'Penacony is beautiful.', translatedZh: '匹诺康尼很美。', sentiment: 'positive', topics: ['美术'] }],
      })),
      fetchSupplement: vi.fn(),
      waitForReauthentication,
    })

    expect(waitForReauthentication).toHaveBeenCalledWith('openai', expect.any(Error))
    expect(attempts).toBe(2)
    expect(result.status).toBe('complete')
  })

  it('stops immediately when the shared browser runtime cannot start', async () => {
    const browser = browserFake([])
    browser.start.mockRejectedValueOnce(new Error('Chromium executable missing'))
    const provider = vi.fn()

    await expect(runAdaptiveResearchChain({
      runId: 'run-browser-fail',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      regions: ['CN'],
      router: fixedRouter(),
      browser,
      planner: { nextAction: vi.fn() },
      providers: { openai_search: provider, bigmodel_search: vi.fn(), webfetch: vi.fn() },
      judgePage: vi.fn(),
      fetchSupplement: vi.fn(),
    })).rejects.toThrow(/Chromium executable missing/)
    expect(provider).not.toHaveBeenCalled()
    expect(browser.close).toHaveBeenCalledOnce()
  })
})
