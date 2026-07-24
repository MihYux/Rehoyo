import { describe, expect, it, vi } from 'vitest'
import {
  createBigModelSearchProvider,
  createGlmResearchPlanner,
  createOpenAIWebSearchProvider,
  createWebFetchDiscoveryProvider,
  fetchPublicSupplement,
  judgePageWithBigModel,
  parseBigModelSearchResponse,
  parseBraveCandidates,
  parseNiconicoCandidates,
  parseRedditRssCandidates,
} from '../../electron/research-provider-adapters.mjs'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, contentType = 'text/html', status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  })
}

describe('research provider adapters', () => {
  it('uses official OpenAI web search and returns candidate URLs without model summaries or evidence', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({
      id: 'resp_search',
      output: [
        {
          type: 'web_search_call',
          action: {
            sources: [{
              url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real',
              title: 'Player reactions',
            }],
          },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Generated search summary that must never become evidence.',
            annotations: [],
          }],
        },
      ],
    }))
    const provider = createOpenAIWebSearchProvider({
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'openai-secret',
      model: 'gpt-5.6',
      fetchImpl,
    })

    const result = await provider({
      region: 'WEST',
      action: { type: 'search_web', query: 'Honkai Star Rail 2.0 player reactions', language: 'en-US', purpose: 'Find player opinions' },
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
    })

    const [, request] = fetchImpl.mock.calls[0]
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'gpt-5.6',
      store: false,
      tools: [{ type: 'web_search', external_web_access: true, search_context_size: 'high' }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
    })
    expect(result).toEqual({
      candidates: [expect.objectContaining({
        url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real',
        provider: 'openai_search',
      })],
    })
    expect(JSON.stringify(result)).not.toContain('Generated search summary')
    expect(result.candidates.every((candidate) => !('excerptOriginal' in candidate) && !('evidence' in candidate))).toBe(true)
  })

  it('parses only unique HTTPS candidate URLs from BigModel search results', () => {
    expect(parseBigModelSearchResponse({
      search_result: [
        { link: 'https://tieba.baidu.com/p/123', title: '玩家讨论', content: '搜索摘要不应成为证据' },
        { url: 'https://tieba.baidu.com/p/123', title: '重复项' },
        { link: 'http://unsafe.example/thread', title: '非 HTTPS' },
        { link: 'https://www.miyoushe.com/sr/article/456', title: '米游社讨论' },
      ],
    })).toEqual([
      expect.objectContaining({ url: 'https://tieba.baidu.com/p/123', title: '玩家讨论', provider: 'bigmodel_search' }),
      expect.objectContaining({ url: 'https://www.miyoushe.com/sr/article/456', title: '米游社讨论', provider: 'bigmodel_search' }),
    ])
    expect(JSON.stringify(parseBigModelSearchResponse({ search_result: [{ link: 'https://example.com', content: 'summary' }] }))).not.toContain('summary')
  })

  it('posts BigModel discovery to /web_search and preserves provider/status metadata on failures', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const provider = createBigModelSearchProvider({
      endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4/',
      apiKey: 'glm-secret',
      fetchImpl: vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init })
        return jsonResponse({ search_result: [{ link: 'https://www.hoyolab.com/article/123', title: 'Discussion' }] })
      }),
    })

    const result = await provider({
      region: 'WEST',
      action: { type: 'search_web', query: 'Penacony player feedback', language: 'en-US', purpose: 'Find original discussions' },
    })

    expect(requests[0].url).toBe('https://open.bigmodel.cn/api/coding/paas/v4/web_search')
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      search_engine: 'search_std',
      search_query: 'Penacony player feedback',
      search_recency_filter: 'noLimit',
      count: 20,
      content_size: 'high',
    })
    expect(result.candidates).toHaveLength(1)

    const expired = createBigModelSearchProvider({
      endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
      apiKey: 'never-leak-this-key',
      fetchImpl: vi.fn(async () => jsonResponse({ error: { message: 'invalid never-leak-this-key' } }, 403)),
    })
    await expect(expired({ region: 'CN', action: { query: '玩家评价', language: 'zh-CN', purpose: '反馈' } })).rejects.toMatchObject({
      provider: 'bigmodel',
      status: 403,
      authRequired: true,
      retryable: false,
    })
    await expect(expired({ region: 'CN', action: { query: '玩家评价', language: 'zh-CN', purpose: '反馈' } })).rejects.not.toThrow('never-leak-this-key')
  })

  it.each([429, 500, 503])('marks HTTP %s provider failures retryable without exposing credentials', async (status) => {
    const provider = createBigModelSearchProvider({
      apiKey: 'secret-value',
      fetchImpl: vi.fn(async () => jsonResponse({ error: { message: `server echoed secret-value` } }, status)),
    })
    await expect(provider({ region: 'JP', action: { query: '感想', language: 'ja-JP', purpose: '反応' } })).rejects.toMatchObject({
      provider: 'bigmodel',
      status,
      authRequired: false,
      retryable: true,
    })
    await expect(provider({ region: 'JP', action: { query: '感想', language: 'ja-JP', purpose: '反応' } })).rejects.not.toThrow('secret-value')
  })

  it('parses Brave, Reddit RSS and Niconico public API responses as candidates only', () => {
    const brave = parseBraveCandidates(`
      <div class="snippet" data-pos="0" data-type="web">
        <a href="https://www.youtube.com/watch?v=abc"><div class="title">2.0 玩家评论</div></a>
        <div class="snippet-description">A generated result snippet.</div>
      </div>
    `)
    const reddit = parseRedditRssCandidates(`
      <feed><entry><title>Penacony feedback</title>
        <link href="https://www.reddit.com/r/HonkaiStarRail/comments/abc/penacony_feedback/" />
        <content>Player prose exposed by RSS but not yet browser verified.</content>
      </entry></feed>
    `)
    const niconico = parseNiconicoCandidates({ data: [{ contentId: 'sm1234', title: 'ピノコニー感想', description: 'summary' }] })

    expect(brave).toEqual([expect.objectContaining({ url: 'https://www.youtube.com/watch?v=abc', provider: 'webfetch' })])
    expect(reddit).toEqual([expect.objectContaining({ url: 'https://www.reddit.com/r/HonkaiStarRail/comments/abc/penacony_feedback/', provider: 'webfetch' })])
    expect(niconico).toEqual([expect.objectContaining({ url: 'https://www.nicovideo.jp/watch/sm1234', provider: 'webfetch' })])
    expect(JSON.stringify([...brave, ...reddit, ...niconico])).not.toMatch(/generated result snippet|Player prose|summary/)
  })

  it('ignores malformed Brave result URLs instead of aborting the discovery batch', () => {
    expect(parseBraveCandidates(`
      <div class="snippet" data-pos="0" data-type="web">
        <a href="https://%"><div class="title">Malformed</div></a>
      </div>
      <div class="snippet" data-pos="1" data-type="web">
        <a href="https://example.com/valid"><div class="title">Valid</div></a>
      </div>
    `)).toEqual([
      expect.objectContaining({ url: 'https://example.com/valid', title: 'Valid' }),
    ])
  })

  it('mixes Brave with regional public discovery endpoints and deduplicates candidates', async () => {
    const urls: string[] = []
    const provider = createWebFetchDiscoveryProvider({
      fetchImpl: vi.fn(async (url: string | URL | Request) => {
        const value = String(url)
        urls.push(value)
        if (value.startsWith('https://search.brave.com/search')) {
          return textResponse('<div class="snippet" data-pos="0" data-type="web"><a href="https://www.reddit.com/r/HonkaiStarRail/comments/same/"><div class="title">Result</div></a></div>')
        }
        return textResponse('<feed><entry><title>Same thread</title><link href="https://www.reddit.com/r/HonkaiStarRail/comments/same/" /></entry><entry><title>Second</title><link href="https://www.reddit.com/r/HonkaiStarRail/comments/second/" /></entry></feed>', 'application/atom+xml')
      }),
    })

    const result = await provider({
      region: 'WEST',
      action: { query: 'Penacony feedback', language: 'en-US', purpose: 'player comments' },
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
    })

    expect(urls.some((url) => url.startsWith('https://search.brave.com/search?'))).toBe(true)
    expect(urls.some((url) => url.includes('reddit.com') && url.includes('.rss'))).toBe(true)
    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      'https://www.reddit.com/r/HonkaiStarRail/comments/same/',
      'https://www.reddit.com/r/HonkaiStarRail/comments/second/',
    ])
  })

  it('fetches supplement text only from the exact public HTTPS URL and never labels it as evidence', async () => {
    const fetchImpl = vi.fn(async () => textResponse('<article>Visible public body</article>'))
    const result = await fetchPublicSupplement({
      url: 'https://example.com/public-thread',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/public-thread', expect.objectContaining({ method: 'GET' }))
    expect(result).toMatchObject({ url: 'https://example.com/public-thread', text: '<article>Visible public body</article>' })
    expect(result).not.toHaveProperty('evidence')
    await expect(fetchPublicSupplement({ url: 'http://example.com/insecure', fetchImpl })).rejects.toThrow(/HTTPS/)
  })

  it('sends browser-observed text to BigModel JSON judgment and parses evidence expressions', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            relevant: true,
            containsPlayerExpression: true,
            needsSupplement: false,
            reason: 'Version and player reaction are both present.',
            expressions: [{
              original: 'Penacony is beautiful, but the pacing is slow.',
              translatedZh: '匹诺康尼很美，但节奏偏慢。',
              author: 'player-one',
              sentiment: 'neutral',
              topics: ['剧情节奏'],
              confidence: 0.92,
            }],
          }),
        },
      }],
    }))

    const judgment = await judgePageWithBigModel({
      endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
      apiKey: 'glm-secret',
      model: 'glm-5.2',
      fetchImpl,
      region: 'WEST',
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      candidate: { url: 'https://example.com/thread', title: 'Thread' },
      page: { text: 'Penacony is beautiful, but the pacing is slow.' },
      comments: ['Penacony is beautiful, but the pacing is slow.'],
    })

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'glm-5.2', response_format: { type: 'json_object' } })
    expect(body.messages[1].content).toContain('Penacony is beautiful')
    expect(judgment).toMatchObject({
      relevant: true,
      containsPlayerExpression: true,
      expressions: [expect.objectContaining({ original: 'Penacony is beautiful, but the pacing is slow.' })],
    })
    await expect(judgePageWithBigModel({
      apiKey: 'glm-secret',
      region: 'WEST',
      request: {},
      candidate: { url: 'https://example.com' },
      page: { text: '' },
      comments: [],
      fetchImpl,
    })).rejects.toThrow(/browser-observed/i)
  })

  it('passes the strict tool schema to GLM and returns message.tool_calls instead of parsing content JSON', async () => {
    const toolSchemas = [{
      type: 'function' as const,
      function: {
        name: 'search_web',
        description: 'Search',
        strict: true,
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    }]
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({
      choices: [{
        message: {
          role: 'assistant',
          content: '{"type":"unsupported_content_action"}',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_web', arguments: '{"query":"new query"}' } }],
        },
      }],
    }))
    const planner = createGlmResearchPlanner({
      endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
      apiKey: 'glm-secret',
      model: 'glm-5.2',
      toolSchemas,
      fetchImpl,
    })

    const message = await planner.nextAction({ region: 'JP', quota: { evidence: 0 }, request: { gameName: '崩坏：星穹铁道' } })

    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.tools).toEqual(toolSchemas)
    expect(body.tool_choice).toBe('required')
    expect(message.tool_calls[0].function.name).toBe('search_web')
    expect(message).toHaveProperty('content', '{"type":"unsupported_content_action"}')
  })
})
