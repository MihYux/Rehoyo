import { describe, expect, it, vi } from 'vitest'
import {
  LIVE_SOURCE_CATALOG,
  applySentimentAnalysis,
  buildSourceSearchPlans,
  decodeXmlEntities,
  isVersionRelevant,
  isPublishedInVersionWindow,
  isPlayerFeedbackResult,
  normalizeSentimentAnalyses,
  parseRedditAtom,
  parseNiconicoSearch,
  parseNiconicoSnapshot,
  runLiveResearch,
  sanitizeResearchRequest,
  sourceFromUrl,
} from '../../electron/research-client.mjs'

const searchResult = (title: string, link: string, content: string, date = '2024-08-30') => ({
  title,
  link,
  content,
  publish_date: date,
  media: new URL(link).hostname,
})

function response(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  })
}

function niconicoHtml(items: unknown[]) {
  const serverResponse = JSON.stringify({
    data: { response: { $getSearchVideoV2: { data: { items } } } },
  }).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<html><head><meta name="server-response" content="${serverResponse}" /></head></html>`
}

describe('live research agent orchestration', () => {
  it('targets a broad, named source catalog across global player markets', () => {
    expect(LIVE_SOURCE_CATALOG.length).toBeGreaterThanOrEqual(25)
    expect(new Set(LIVE_SOURCE_CATALOG.map((source) => source.id)).size).toBe(LIVE_SOURCE_CATALOG.length)

    const names = LIVE_SOURCE_CATALOG.map((source) => source.name)
    expect(names).toEqual(expect.arrayContaining([
      'HoYoPlay',
      '米游社',
      'YouTube',
      '百度贴吧',
      'Bilibili',
      'Niconico',
      'Reddit',
      'HoYoLAB',
      '巴哈姆特',
      'DCInside',
      'Jeuxvideo.com',
    ]))

    const markets = new Set(LIVE_SOURCE_CATALOG.flatMap((source) => source.markets))
    expect([...markets]).toEqual(expect.arrayContaining(['CN', 'JP', 'KR', 'TW', 'NA', 'EU', 'RU', 'GLOBAL']))
    expect(sourceFromUrl('https://www.miyoushe.com/ys/article/123')).toBe('米游社')
    expect(sourceFromUrl('https://tieba.baidu.com/p/123')).toBe('百度贴吧')
    expect(sourceFromUrl('https://youtu.be/example')).toBe('YouTube')
    expect(sourceFromUrl('https://gall.dcinside.com/mgallery/board/view/?id=onshinproject')).toBe('DCInside')
  })

  it('builds site-restricted searches that cover every web-discovered source', () => {
    const request = sanitizeResearchRequest({
      gameName: '原神',
      versionLabel: '5.0',
      versionTitle: '荣花与炎日之途',
      regions: ['CN', 'JP', 'WEST'],
    })
    const plans = request.regions.flatMap((region) => buildSourceSearchPlans(request, region))
    const queries = plans.map((plan) => plan.query).join(' ')
    const plannedDomains = new Set(plans.flatMap((plan) => plan.domains))
    const webDomains = LIVE_SOURCE_CATALOG
      .filter((source) => source.discovery === 'web')
      .flatMap((source) => source.domains)

    expect(plans.length).toBeGreaterThanOrEqual(8)
    expect(webDomains.every((domain) => plannedDomains.has(domain))).toBe(true)
    expect(queries).toContain('site:hoyoplay.hoyoverse.com')
    expect(queries).toContain('site:miyoushe.com')
    expect(queries).toContain('site:youtube.com')
    expect(queries).toContain('site:tieba.baidu.com')
    expect(queries).toContain('후기')
    expect(queries).toContain('avis joueurs')
  })

  it('decodes named, decimal, and hexadecimal entities from public feeds', () => {
    expect(decodeXmlEntities('submitted&#32;by&#x20;player &amp; team')).toBe('submitted by player & team')
  })

  it('keeps Reddit post text while removing embedded preview URLs and feed controls', () => {
    const [entry] = parseRedditAtom(`<?xml version="1.0"?><feed><entry>
      <title>Natlan 5.0 exploration review</title><author><name>traveler</name></author>
      <link href="https://www.reddit.com/r/Genshin_Impact/comments/real/natlan/" />
      <updated>2024-08-31T08:00:00Z</updated>
      <content type="html"><![CDATA[<div>The movement feels great. https://preview.redd.it/noise.jpg?width=1080<br>Story pacing is uneven.</div><p>submitted by <a href="https://reddit.com/u/traveler">u/traveler</a> [link] [comments]</p>]]></content>
    </entry></feed>`)

    expect(entry.content).toBe('The movement feels great. Story pacing is uneven.')
    expect(entry.content).not.toContain('preview.redd.it')
    expect(entry.content).not.toContain('submitted by')
  })

  it('requires both the game and a strong update alias before accepting a result', () => {
    const request = sanitizeResearchRequest({
      gameName: '原神',
      versionLabel: '5.0',
      versionTitle: '荣花与炎日之途',
      regions: ['CN', 'JP', 'WEST'],
    })

    expect(isVersionRelevant({ title: '原神：PS4 服务即将结束', content: '月之五版本公告' }, request)).toBe(false)
    expect(isVersionRelevant({ title: '原神 5.0 纳塔体验', content: '玛拉妮与卡齐娜讨论' }, request)).toBe(true)
    expect(isVersionRelevant({ title: 'Genshin Impact Natlan feedback', content: 'Mualani exploration' }, request)).toBe(true)
    expect(isPublishedInVersionWindow('2024-08-31T08:00:00Z', request)).toBe(true)
    expect(isPublishedInVersionWindow('2024-08-16T08:00:00Z', request)).toBe(true)
    expect(isPublishedInVersionWindow('2025-03-30T18:25:04+09:00', request)).toBe(false)
    expect(isPublishedInVersionWindow('', request)).toBe(false)
    expect(isPlayerFeedbackResult({ title: 'Natlan monthly revenue', content: 'SensorTower data about which game made more money' })).toBe(false)
    expect(isPlayerFeedbackResult({ title: 'Natlan revenue debate', content: 'SensorTower opinions about the player experience and which game made more money' })).toBe(false)
    expect(isPlayerFeedbackResult({ title: 'Natlan exploration feedback', content: 'The movement is fun, but the story pacing feels rushed.' })).toBe(true)
  })

  it('parses Niconico server-response metadata into verifiable Japanese records', () => {
    const html = niconicoHtml([{
      id: 'sm44000001',
      title: '【原神 5.0】ナタを遊んだ感想',
      shortDescription: 'ムアラニの移動が楽しい',
      registeredAt: '2024-08-31T18:25:04+09:00',
      count: { view: 1200, comment: 48, like: 75 },
      owner: { name: '旅人A' },
    }])

    expect(parseNiconicoSearch(html)).toEqual([expect.objectContaining({
      id: 'sm44000001',
      title: '【原神 5.0】ナタを遊んだ感想',
      author: '旅人A',
      commentCount: 48,
    })])
  })

  it('parses Niconico official snapshot search records with publication metadata', () => {
    expect(parseNiconicoSnapshot({
      meta: { status: 200 },
      data: [{
        contentId: 'sm44062283',
        title: '原神 Ver.5.0 ムアラニの伝説任務',
        description: 'ナタの新地域を遊びます<br>ムアラニが楽しい',
        userId: 12345,
        startTime: '2024-09-04T00:23:04+09:00',
        viewCounter: 1200,
        commentCounter: 7,
        likeCounter: 18,
        tags: '原神 ナタ ムアラニ',
      }],
    })).toEqual([expect.objectContaining({
      id: 'sm44062283',
      author: 'Niconico user 12345',
      commentCount: 7,
      registeredAt: '2024-09-04T00:23:04+09:00',
      content: 'ナタの新地域を遊びます ムアラニが楽しい 原神 ナタ ムアラニ',
    })])
  })

  it('normalizes the single-record shape returned by GLM for one evidence item', () => {
    expect(normalizeSentimentAnalyses({
      evidenceId: 'live-west-001',
      sentiment: 'neutral',
      topics: ['剧情节奏'],
      confidence: 0.85,
      excerptZh: '移动玩法有趣，但剧情节奏太赶。',
    })).toEqual([expect.objectContaining({ id: 'live-west-001', confidence: 0.85 })])
  })

  it('stops instead of silently converting an unmapped Agent response to neutral', () => {
    expect(() => applySentimentAnalysis([
      { id: 'live-west-001', sentiment: 'neutral', topics: [], confidence: 0 },
    ], { summary: 'missing classifications' })).toThrow(/无法映射/)
  })

  it('bounds renderer input and does not accept credentials or endpoints', () => {
    const request = sanitizeResearchRequest({
      gameName: '  原神  ',
      versionLabel: '5.0',
      versionTitle: '荣花与炎日之途',
      apiKey: 'must-not-cross-ipc',
      endpoint: 'https://evil.example',
      regions: ['CN', 'JP', 'WEST', 'UNKNOWN'],
    })

    expect(request).toEqual({
      gameName: '原神',
      versionLabel: '5.0',
      versionTitle: '荣花与炎日之途',
      regions: ['CN', 'JP', 'WEST'],
    })
    expect(request).not.toHaveProperty('apiKey')
    expect(request).not.toHaveProperty('endpoint')
  })

  it('runs real retrieval before parallel analysis and never injects demo evidence', async () => {
    const calls: string[] = []
    let redditUrl = ''
    let sentimentSystem = ''
    let strategyPayload: Record<string, unknown> = {}
    const events: Array<{
      agentId: string
      kind: string
      message: string
      evidenceRecords?: Array<{ id: string; confidence: number }>
    }> = []
    const redditAtom = `<?xml version="1.0"?><feed>
      <entry><title>Natlan exploration feels fresh</title><author><name>player_one</name></author>
      <link href="https://www.reddit.com/r/Genshin_Impact/comments/real1/natlan_feedback/" />
      <updated>2024-08-31T08:00:00Z</updated><content type="html">The movement is fun&#32;but the story pacing feels rushed.</content></entry>
      <entry><title>Which future character are you saving for?</title><author><name>player_two</name></author>
      <link href="https://www.reddit.com/r/Genshin_Impact/comments/noise1/future_character/" />
      <updated>2025-12-01T08:00:00Z</updated><content type="html">A generic discussion unrelated to the selected update.</content></entry>
    </feed>`

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('reddit.com')) {
        calls.push('retrieve:reddit')
        redditUrl = url
        return response(redditAtom, 200, 'application/atom+xml')
      }
      if (url.includes('snapshot.search.nicovideo.jp')) {
        calls.push('retrieve:niconico-snapshot')
        return response({ meta: { status: 200 }, data: [{
          contentId: 'sm44000001',
          title: '【原神 5.0】ナタを遊んだ感想',
          description: 'ムアラニの移動が楽しい',
          startTime: '2024-08-31T18:25:04+09:00',
          viewCounter: 1200,
          commentCounter: 48,
          likeCounter: 75,
          userId: 9876,
          tags: '原神 ナタ ムアラニ',
        }] })
      }
      if (url.includes('nicovideo.jp/search/')) {
        calls.push('retrieve:niconico')
        return response(niconicoHtml([{
          id: 'sm44000001',
          title: '【原神 5.0】ナタを遊んだ感想',
          shortDescription: 'ムアラニの移動が楽しい',
          registeredAt: '2024-08-31T18:25:04+09:00',
          count: { view: 1200, comment: 48, like: 75 },
          owner: { name: '旅人A' },
        }]), 200, 'text/html')
      }
      if (url.endsWith('/web_search')) {
        const body = JSON.parse(String(init?.body))
        calls.push(`retrieve:${body.search_query}`)
        const result = searchResult('原神 5.0 玩家实测讨论', 'https://www.bilibili.com/video/BV1REALCN/', '玩家讨论纳塔探索与角色培养成本。')
        const offDomain = searchResult('原神 5.0 纳塔新闻转载', 'https://news.example.com/genshin-natlan/', '转载玛拉妮与卡齐娜版本信息。')
        return response({ id: 'search-request', search_result: [result, offDomain] })
      }
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body))
        const system = String(body.messages[0].content)
        if (system.includes('情绪分析')) {
          calls.push('agent:sentiment')
          sentimentSystem = system
          return response({ id: 'sentiment-1', model: 'glm-5.2', choices: [{ message: { content: JSON.stringify({
            summary: '探索体验整体积极，剧情节奏与培养成本形成负面原因簇。',
            analyses: [
              { evidenceId: 'live-west-001', sentiment: 'negative', topics: ['剧情节奏'], confidence: 0.91, excerptZh: '移动探索很有趣，但剧情节奏显得仓促。' },
              { evidence_id: 'live-cn-001', sentiment: 'neutral', topics: ['培养成本'], confidence: 0.87, excerptZh: '玩家同时讨论纳塔探索与角色培养成本。' },
              { id: 'live-jp-001', sentiment: 'positive', topics: ['角色塑造'], confidence: 0.84, excerptZh: '玩家关注角色与故事表现。' },
            ],
          }) } }] })
        }
        if (system.includes('地区差异')) {
          calls.push('agent:regional')
          return response({ id: 'regional-1', model: 'glm-5.2', choices: [{ message: { content: JSON.stringify({ regions: [
            { region: 'CN', label: '中国', sentimentScore: 58, topConcern: '培养成本', secondaryConcern: '探索体验', insight: '中国公开页面更集中讨论投入产出。' },
            { region: 'JP', label: '日本', sentimentScore: 72, topConcern: '角色塑造', secondaryConcern: '故事表现', insight: '日本公开页面更重视角色与故事。' },
            { region: 'WEST', label: '欧美', sentimentScore: 54, topConcern: '剧情节奏', secondaryConcern: '移动探索', insight: 'Reddit 讨论同时肯定探索并质疑叙事节奏。' },
          ] }) } }] })
        }
        calls.push('agent:strategy')
        strategyPayload = JSON.parse(String(body.messages[1].content))
        return response({ id: 'strategy-1', model: 'glm-5.2', choices: [{ message: { content: JSON.stringify({
          summary: '真实公开网页证据显示地区关注点存在差异。',
          riskLevel: 'high',
          controversies: [{ title: '剧情节奏与版本预期落差', description: '部分讨论认为叙事推进仓促。', severity: 'high', region: 'GLOBAL', evidenceIds: ['live-west-001', 'live-cn-001'], propagation: '模型不应决定传播路径' }],
          recommendations: [{ priority: 'P0', title: '校准剧情传播预期', action: '在版本传播材料中展示完整叙事节奏。', rationale: '回应可核验的剧情节奏证据。', region: 'GLOBAL', evidenceIds: ['live-west-001'] }],
        }) } }] })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const preset = await runLiveResearch({
      config: {
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        searchBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        keyFile: 'C:/secure/key.txt',
        model: 'glm-5.2',
        configured: true,
      },
      request: { gameName: '原神', versionLabel: '5.0', versionTitle: '荣花与炎日之途', regions: ['CN', 'JP', 'WEST'] },
      fetchImpl,
      getApiKey: vi.fn(async () => 'private-test-key'),
      now: (() => { let value = 1_000; return () => (value += 250) })(),
      onEvent: (event) => events.push(event),
    })

    const lastRetrievalIndex = Math.max(...calls.map((call, index) => call.startsWith('retrieve:') ? index : -1))
    expect(calls.indexOf('agent:sentiment')).toBeGreaterThan(lastRetrievalIndex)
    expect(calls.indexOf('agent:regional')).toBeGreaterThan(lastRetrievalIndex)
    expect(calls.at(-1)).toBe('agent:strategy')
    expect(calls).toContain('retrieve:niconico-snapshot')
    expect(decodeURIComponent(redditUrl)).toContain('/r/Genshin_Impact/search.rss')
    expect(decodeURIComponent(redditUrl)).toContain('Natlan 5.0 feedback')
    expect(redditUrl).toContain('restrict_sr=on')
    const webSearchCalls = calls.filter((call) => call.startsWith('retrieve:') && !call.endsWith('reddit') && !call.endsWith('niconico-snapshot'))
    expect(webSearchCalls.length).toBeGreaterThanOrEqual(8)
    expect(webSearchCalls.some((call) => call.includes('纳塔 玩家 评价'))).toBe(true)
    expect(webSearchCalls.some((call) => call.includes('site:hoyoplay.hoyoverse.com'))).toBe(true)
    expect(webSearchCalls.some((call) => call.includes('site:miyoushe.com'))).toBe(true)
    expect(webSearchCalls.some((call) => call.includes('site:youtube.com'))).toBe(true)
    expect(webSearchCalls.some((call) => call.includes('site:tieba.baidu.com'))).toBe(true)
    expect(events[0]).toMatchObject({ agentId: 'research', kind: 'status' })
    expect(sentimentSystem).toContain('"analyses"')
    expect(strategyPayload).toMatchObject({ derivedMetrics: { positivePercent: 33, negativePercent: 33, neutralPercent: 34 } })
    expect(events.at(-1)).toMatchObject({ agentId: 'strategy', kind: 'complete' })
    expect(events.find((event) => event.agentId === 'sentiment' && event.kind === 'handoff')?.evidenceRecords)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'live-west-001', confidence: 0.91 })]))
    expect(preset.dataMode).toBe('live')
    expect(preset.evidence).toHaveLength(3)
    expect(preset.evidence.every((item) => item.synthetic === false)).toBe(true)
    expect(preset.evidence.every((item) => item.url?.startsWith('https://'))).toBe(true)
    expect(preset.evidence.find((item) => item.region === 'WEST')?.excerptOriginal).not.toContain('&#32;')
    expect(preset.evidence.find((item) => item.region === 'WEST')?.excerptOriginal).toMatch(/^Natlan exploration feels fresh/)
    expect(preset.evidence.find((item) => item.region === 'JP')).toMatchObject({ source: 'Niconico', language: 'ja-JP' })
    expect(preset.evidence.find((item) => item.region === 'JP')?.excerptOriginal).toMatch(/^【原神 5\.0】/)
    expect(preset.report.sampleCount).toBe(3)
    expect(preset.report).toMatchObject({ positivePercent: 33, negativePercent: 33, neutralPercent: 34 })
    expect(preset.report.summary).toContain('正面 33% · 中性 34% · 负面 33%')
    expect(preset.report.regions.map((region) => [region.region, region.sentimentScore])).toEqual([
      ['CN', 50],
      ['JP', 100],
      ['WEST', 0],
    ])
    expect(preset.report.controversies[0].evidenceIds).toEqual(['live-west-001', 'live-cn-001'])
    expect(preset.report.controversies[0].propagation).toBe('Reddit → Bilibili')
  })
})
