import { describe, expect, it, vi } from 'vitest'
import {
  runLiveResearch,
  sanitizeResearchRequest,
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

describe('live research agent orchestration', () => {
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
    const events: Array<{ agentId: string; kind: string; message: string }> = []
    const redditAtom = `<?xml version="1.0"?><feed>
      <entry><title>Natlan exploration feels fresh</title><author><name>player_one</name></author>
      <link href="https://www.reddit.com/r/Genshin_Impact/comments/real1/natlan_feedback/" />
      <updated>2024-08-31T08:00:00Z</updated><content type="html">The movement is fun, but the story pacing feels rushed.</content></entry>
    </feed>`

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('reddit.com')) {
        calls.push('retrieve:reddit')
        return response(redditAtom, 200, 'application/atom+xml')
      }
      if (url.endsWith('/web_search')) {
        const body = JSON.parse(String(init?.body))
        calls.push(`retrieve:${body.search_query}`)
        const result = body.search_query.includes('中国')
          ? searchResult('原神 5.0 玩家实测讨论', 'https://www.bilibili.com/video/BV1REALCN/', '玩家讨论纳塔探索与角色培养成本。')
          : searchResult('原神5.0 ナタ感想', 'https://www.youtube.com/watch?v=REALJP1', 'キャラクターと物語へのプレイヤー反応。')
        return response({ id: 'search-request', search_result: [result] })
      }
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body))
        const system = String(body.messages[0].content)
        if (system.includes('情绪分析')) {
          calls.push('agent:sentiment')
          return response({ id: 'sentiment-1', model: 'glm-5.2', choices: [{ message: { content: JSON.stringify({
            summary: '探索体验整体积极，剧情节奏与培养成本形成负面原因簇。',
            evidence: [
              { id: 'live-west-001', sentiment: 'negative', topics: ['剧情节奏'], confidence: 0.91, excerptZh: '移动探索很有趣，但剧情节奏显得仓促。' },
              { id: 'live-cn-001', sentiment: 'neutral', topics: ['培养成本'], confidence: 0.87, excerptZh: '玩家同时讨论纳塔探索与角色培养成本。' },
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
        return response({ id: 'strategy-1', model: 'glm-5.2', choices: [{ message: { content: JSON.stringify({
          summary: '真实公开网页证据显示地区关注点存在差异。',
          riskLevel: 'high',
          controversies: [{ title: '剧情节奏与版本预期落差', description: '部分讨论认为叙事推进仓促。', severity: 'high', region: 'WEST', evidenceIds: ['live-west-001'], propagation: 'Reddit 主题讨论 → 跨平台复述' }],
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
      readKeyFile: vi.fn(async () => 'private-test-key'),
      now: (() => { let value = 1_000; return () => (value += 250) })(),
      onEvent: (event) => events.push(event),
    })

    const lastRetrievalIndex = Math.max(...calls.map((call, index) => call.startsWith('retrieve:') ? index : -1))
    expect(calls.indexOf('agent:sentiment')).toBeGreaterThan(lastRetrievalIndex)
    expect(calls.indexOf('agent:regional')).toBeGreaterThan(lastRetrievalIndex)
    expect(calls.at(-1)).toBe('agent:strategy')
    expect(events[0]).toMatchObject({ agentId: 'research', kind: 'status' })
    expect(events.at(-1)).toMatchObject({ agentId: 'strategy', kind: 'complete' })
    expect(preset.dataMode).toBe('live')
    expect(preset.evidence).toHaveLength(3)
    expect(preset.evidence.every((item) => item.synthetic === false)).toBe(true)
    expect(preset.evidence.every((item) => item.url?.startsWith('https://'))).toBe(true)
    expect(preset.report.sampleCount).toBe(3)
    expect(preset.report.controversies[0].evidenceIds).toEqual(['live-west-001'])
  })
})
