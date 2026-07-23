import { readFile } from 'node:fs/promises'

const SEARCH_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const NICONICO_SNAPSHOT_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
const VALID_REGIONS = new Set(['CN', 'JP', 'WEST'])
const GAME_ALIASES = new Map([
  ['原神', 'Genshin Impact'],
  ['崩坏：星穹铁道', 'Honkai Star Rail'],
  ['崩坏:星穹铁道', 'Honkai Star Rail'],
  ['绝区零', 'Zenless Zone Zero'],
])
const LOCALIZED_GAME_ALIASES = new Map([
  ['原神', ['原神', 'Genshin Impact']],
  ['崩坏：星穹铁道', ['崩坏：星穹铁道', '崩坏:星穹铁道', 'Honkai Star Rail', '崩壊：スターレイル', '崩壊 スターレイル']],
  ['崩坏:星穹铁道', ['崩坏：星穹铁道', '崩坏:星穹铁道', 'Honkai Star Rail', '崩壊：スターレイル', '崩壊 スターレイル']],
  ['绝区零', ['绝区零', 'Zenless Zone Zero', 'ゼンレスゾーンゼロ']],
])
const VERSION_ALIASES = new Map([
  ['原神|5.0', ['荣花与炎日之途', 'Flowers Resplendent on the Sun-Scorched Sojourn', 'Natlan', '纳塔', 'ナタ', 'Mualani', '玛拉妮', 'ムアラニ', 'Kachina', '卡齐娜', 'カチーナ', 'Kinich', '基尼奇', 'キィニチ']],
  ['崩坏：星穹铁道|2.0', ['假如在午夜入梦', 'If One Dreams at Midnight', 'Penacony', '匹诺康尼', 'ピノコニー', 'Black Swan', '黑天鹅', 'ブラックスワン', 'Sparkle', '花火', 'スパークル']],
  ['崩坏:星穹铁道|2.0', ['假如在午夜入梦', 'If One Dreams at Midnight', 'Penacony', '匹诺康尼', 'ピノコニー', 'Black Swan', '黑天鹅', 'ブラックスワン', 'Sparkle', '花火', 'スパークル']],
  ['绝区零|1.1', ['卧底蓝调', 'Undercover R&B', 'New Eridu Public Security', 'Qingyi', '青衣', 'Jane Doe', '简', 'ジェーン', '治安局']],
])
const JAPANESE_SEARCH_TERMS = new Map([
  ['原神|5.0', ['原神', 'ナタ']],
  ['崩坏：星穹铁道|2.0', ['崩壊：スターレイル', 'ピノコニー']],
  ['崩坏:星穹铁道|2.0', ['崩壊：スターレイル', 'ピノコニー']],
  ['绝区零|1.1', ['ゼンレスゾーンゼロ', 'ジェーン']],
])
const WESTERN_SEARCH_TERMS = new Map([
  ['原神|5.0', 'Natlan 5.0 feedback'],
  ['崩坏：星穹铁道|2.0', 'Penacony 2.0 feedback'],
  ['崩坏:星穹铁道|2.0', 'Penacony 2.0 feedback'],
  ['绝区零|1.1', '1.1 Jane Doe feedback'],
])
const REDDIT_COMMUNITIES = new Map([
  ['原神', 'Genshin_Impact'],
  ['崩坏：星穹铁道', 'HonkaiStarRail'],
  ['崩坏:星穹铁道', 'HonkaiStarRail'],
  ['绝区零', 'ZenlessZoneZero'],
])
const CHINESE_SEARCH_TERMS = new Map([
  ['原神|5.0', '原神 5.0 纳塔 玩家 评价 体验'],
  ['崩坏：星穹铁道|2.0', '崩坏 星穹铁道 2.0 匹诺康尼 玩家 评价 体验'],
  ['崩坏:星穹铁道|2.0', '崩坏 星穹铁道 2.0 匹诺康尼 玩家 评价 体验'],
  ['绝区零|1.1', '绝区零 1.1 简 青衣 玩家 评价 体验'],
])
const VERSION_WINDOWS = new Map([
  ['原神|5.0', ['2024-08-14T00:00:00Z', '2024-10-08T23:59:59Z']],
  ['崩坏：星穹铁道|2.0', ['2024-01-26T00:00:00Z', '2024-03-26T23:59:59Z']],
  ['崩坏:星穹铁道|2.0', ['2024-01-26T00:00:00Z', '2024-03-26T23:59:59Z']],
  ['绝区零|1.1', ['2024-08-03T00:00:00Z', '2024-09-24T23:59:59Z']],
])
const ALLOWED_CN_HOSTS = [
  'bilibili.com',
  'taptap.cn',
  'miyoushe.com',
  'mihoyo.com',
  'hoyolab.com',
  'nga.cn',
  'tieba.baidu.com',
  'zhihu.com',
]

function cleanString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export function sanitizeResearchRequest(value) {
  const input = value && typeof value === 'object' ? value : {}
  const gameName = cleanString(input.gameName, 120)
  const versionLabel = cleanString(input.versionLabel, 80)
  const versionTitle = cleanString(input.versionTitle, 180)
  if (!gameName || !versionTitle) throw new Error('Game and update names are required for live research.')

  const regions = Array.isArray(input.regions)
    ? [...new Set(input.regions.map((region) => cleanString(region, 12)).filter((region) => VALID_REGIONS.has(region)))]
    : []

  return {
    gameName,
    versionLabel,
    versionTitle,
    regions: regions.length ? regions : ['CN', 'JP', 'WEST'],
  }
}

export function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function textFromHtml(value) {
  return decodeXmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textFromPublicFeed(value) {
  return textFromHtml(value)
    .replace(/https?:\/\/\S+/gi, ' ')
    .split(/\bsubmitted\s+by\b/i, 1)[0]
    .replace(/\[(?:link|comments)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(entry, name) {
  return decodeXmlEntities(entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
}

export function parseRedditAtom(xml) {
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const entry = match[1]
    const url = decodeXmlEntities(entry.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? '')
    return {
      title: textFromHtml(tag(entry, 'title')),
      author: textFromHtml(tag(tag(entry, 'author'), 'name')) || 'Reddit user',
      url,
      updated: textFromHtml(tag(entry, 'updated')),
      content: textFromPublicFeed(tag(entry, 'content')),
    }
  }).filter((item) => item.url.startsWith('https://') && (item.title || item.content))
}

export function parseNiconicoSearch(html) {
  const encoded = String(html ?? '').match(/<meta\s+[^>]*name=["']server-response["'][^>]*content=["']([\s\S]*?)["']\s*\/?\s*>/i)?.[1]
  if (!encoded) return []
  let payload
  try {
    payload = JSON.parse(decodeXmlEntities(encoded))
  } catch {
    return []
  }
  const items = payload?.data?.response?.$getSearchVideoV2?.data?.items
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    id: cleanString(item?.id, 80),
    title: cleanString(item?.title, 300),
    content: cleanString(item?.shortDescription, 1_600),
    author: cleanString(item?.owner?.name, 120) || 'Niconico user',
    registeredAt: cleanString(item?.registeredAt, 80),
    viewCount: clampNumber(item?.count?.view, 0, Number.MAX_SAFE_INTEGER, 0),
    commentCount: clampNumber(item?.count?.comment, 0, Number.MAX_SAFE_INTEGER, 0),
    likeCount: clampNumber(item?.count?.like, 0, Number.MAX_SAFE_INTEGER, 0),
  })).filter((item) => item.id && item.title)
}

export function parseNiconicoSnapshot(payload) {
  if (Number(payload?.meta?.status) !== 200 || !Array.isArray(payload?.data)) return []
  return payload.data.map((item) => ({
    id: cleanString(item?.contentId, 80),
    title: cleanString(item?.title, 300),
    content: cleanString(textFromHtml([item?.description, item?.tags].filter(Boolean).join(' ')), 1_600),
    author: item?.userId ? `Niconico user ${cleanString(item.userId, 80)}` : 'Niconico user',
    registeredAt: cleanString(item?.startTime, 80),
    viewCount: clampNumber(item?.viewCounter, 0, Number.MAX_SAFE_INTEGER, 0),
    commentCount: clampNumber(item?.commentCounter, 0, Number.MAX_SAFE_INTEGER, 0),
    likeCount: clampNumber(item?.likeCounter, 0, Number.MAX_SAFE_INTEGER, 0),
  })).filter((item) => item.id && item.title)
}

function gameAlias(gameName) {
  return GAME_ALIASES.get(gameName) || gameName
}

function sourceFromUrl(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '')
  if (hostname.endsWith('reddit.com')) return 'Reddit'
  if (hostname.endsWith('bilibili.com')) return 'Bilibili'
  if (hostname.endsWith('youtube.com') || hostname === 'youtu.be') return 'YouTube'
  if (hostname.endsWith('hoyolab.com')) return 'HoYoLAB'
  if (hostname.endsWith('taptap.cn')) return 'TapTap'
  if (hostname.endsWith('apps.apple.com') || hostname.endsWith('itunes.apple.com')) return 'App Store'
  return hostname
}

function isAllowedCnSource(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return ALLOWED_CN_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

function sourceType(source) {
  if (source === 'YouTube' || source === 'Bilibili') return 'video'
  if (source === 'App Store') return 'store'
  if (source === 'Reddit' || source === 'HoYoLAB' || source === 'TapTap') return 'community'
  return 'forum'
}

function languageFor(region) {
  if (region === 'CN') return 'zh-CN'
  if (region === 'JP') return 'ja-JP'
  return 'en-US'
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[_:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aliasesForRequest(request) {
  const game = LOCALIZED_GAME_ALIASES.get(request.gameName) || [request.gameName, gameAlias(request.gameName)]
  const version = VERSION_ALIASES.get(`${request.gameName}|${request.versionLabel}`) || [request.versionTitle]
  return { game, version: [...new Set([request.versionTitle, ...version].filter(Boolean))] }
}

export function isVersionRelevant(item, request) {
  const haystack = normalizeSearchText(`${item?.title || ''} ${item?.content || ''} ${item?.url || item?.link || ''}`)
  const aliases = aliasesForRequest(request)
  const hasGame = aliases.game
    .map(normalizeSearchText)
    .filter((value) => value.length > 1)
    .some((candidate) => haystack.includes(candidate))
  const hasVersion = aliases.version
    .map(normalizeSearchText)
    .filter((value) => value.length > 1)
    .some((candidate) => haystack.includes(candidate))
  return hasGame && hasVersion
}

export function isPublishedInVersionWindow(value, request) {
  const window = VERSION_WINDOWS.get(`${request.gameName}|${request.versionLabel}`)
  if (!window) return true
  const timestamp = Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) return false
  return timestamp >= Date.parse(window[0]) && timestamp <= Date.parse(window[1])
}

export function isPlayerFeedbackResult(item) {
  const haystack = normalizeSearchText(`${item?.title || ''} ${item?.content || ''}`)
  const metricsOnly = ['sensortower', 'revenue', 'sales chart', 'monthly income', 'made more money', 'grossing', '流水', '营收']
    .some((term) => haystack.includes(normalizeSearchText(term)))
  const experienceTerms = [
    'feedback', 'review', 'thoughts', 'opinion', 'experience', 'exploration', 'gameplay', 'combat', 'story', 'quest', 'character', 'pacing',
    '感想', 'レビュー', '実況', 'プレイ', '探索', '戦闘', 'ストーリー', '伝説任務', 'キャラ', 'ムアラニ', 'カチーナ', 'キィニチ', 'ピノコニー', 'ジェーン',
    '评价', '体验', '实测', '感受', '剧情', '探索', '战斗', '角色', '任务', '玛拉妮', '卡齐娜', '基尼奇', '匹诺康尼', '青衣',
  ]
  const experienceMatches = experienceTerms.filter((term) => haystack.includes(normalizeSearchText(term))).length
  return !metricsOnly && experienceMatches > 0
}

async function fetchRedditEvidence({ request, apiKey: _apiKey, fetchImpl }) {
  if (!request.regions.includes('WEST')) return []
  const query = WESTERN_SEARCH_TERMS.get(`${request.gameName}|${request.versionLabel}`)
    || `${gameAlias(request.gameName)} ${request.versionLabel} ${request.versionTitle} feedback`.trim()
  const community = REDDIT_COMMUNITIES.get(request.gameName)
  const searchPath = community ? `/r/${community}/search.rss` : '/search.rss'
  const url = `https://www.reddit.com${searchPath}?q=${encodeURIComponent(query)}${community ? '&restrict_sr=on' : ''}&sort=relevance&t=all`
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/atom+xml',
      'User-Agent': 'windows:com.rehoyo.player-intelligence:v0.1 (public research client)',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Reddit RSS returned HTTP ${response.status}.`)
  const entries = parseRedditAtom(await response.text())
    .filter((item) => isVersionRelevant(item, request))
    .filter((item) => isPublishedInVersionWindow(item.updated, request))
    .filter((item) => isPlayerFeedbackResult(item))
    .slice(0, 6)
  return entries.map((item, index) => ({
    id: `live-west-${String(index + 1).padStart(3, '0')}`,
    source: 'Reddit',
    sourceType: 'community',
    region: 'WEST',
    language: 'en-US',
    author: item.author,
    title: item.title,
    url: item.url,
    excerptOriginal: cleanString([item.title, /^submitted by\b/i.test(item.content) ? '' : item.content].filter(Boolean).join(' — '), 1_600),
    excerptZh: cleanString([item.title, /^submitted by\b/i.test(item.content) ? '' : item.content].filter(Boolean).join(' — '), 1_600),
    sentiment: 'neutral',
    topics: [],
    confidence: 0,
    engagement: 0,
    publishedLabel: item.updated ? item.updated.slice(0, 10) : '公开页面',
    retrievedAt: new Date().toISOString(),
    synthetic: false,
  }))
}

async function fetchNiconicoEvidence({ request, fetchImpl }) {
  if (!request.regions.includes('JP')) return []
  const terms = JAPANESE_SEARCH_TERMS.get(`${request.gameName}|${request.versionLabel}`) || [request.gameName, request.versionTitle]
  const versionWindow = VERSION_WINDOWS.get(`${request.gameName}|${request.versionLabel}`)
  const params = new URLSearchParams({
    q: `${terms[0]} ${request.versionLabel}`.trim(),
    targets: 'title,description,tags',
    fields: 'contentId,title,description,userId,viewCounter,commentCounter,likeCounter,startTime,tags',
    _sort: '-commentCounter',
    _limit: '30',
    _context: 'rehoyo_public_research',
  })
  if (versionWindow) {
    params.set('filters[startTime][gte]', versionWindow[0])
    params.set('filters[startTime][lte]', versionWindow[1])
  }
  const response = await fetchImpl(`${NICONICO_SNAPSHOT_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ReHoYo/0.1 public-research-client',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Niconico snapshot search returned HTTP ${response.status}.`)
  return parseNiconicoSnapshot(await response.json())
    .filter((item) => isVersionRelevant(item, request))
    .filter((item) => isPublishedInVersionWindow(item.registeredAt, request))
    .filter((item) => isPlayerFeedbackResult(item))
    .slice(0, 6)
    .map((item, index) => ({
      id: `live-jp-${String(index + 1).padStart(3, '0')}`,
      source: 'Niconico',
      sourceType: 'video',
      region: 'JP',
      language: 'ja-JP',
      author: item.author,
      title: item.title,
      url: `https://www.nicovideo.jp/watch/${encodeURIComponent(item.id)}`,
      excerptOriginal: cleanString([item.title, item.content].filter(Boolean).join(' — '), 1_600),
      excerptZh: cleanString([item.title, item.content].filter(Boolean).join(' — '), 1_600),
      sentiment: 'neutral',
      topics: [],
      confidence: 0,
      engagement: item.commentCount,
      publishedLabel: item.registeredAt ? item.registeredAt.slice(0, 10) : '公开页面',
      retrievedAt: new Date().toISOString(),
      synthetic: false,
    }))
}

async function fetchWebSearchEvidence({ request, region, apiKey, config, fetchImpl }) {
  const query = CHINESE_SEARCH_TERMS.get(`${request.gameName}|${request.versionLabel}`)
    || `${request.gameName} ${request.versionLabel} ${request.versionTitle} 中国 玩家 评价 体验`.trim()
  const response = await fetchImpl(`${config.searchBaseUrl || SEARCH_BASE_URL}/web_search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      search_engine: 'search_std',
      search_query: query,
      search_recency_filter: 'noLimit',
      count: 10,
      content_size: 'medium',
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`BigModel Web Search failed: ${cleanString(payload?.error?.message || `HTTP ${response.status}`, 220)}`)
  }

  const results = Array.isArray(payload.search_result) ? payload.search_result : []
  return results
    .filter((item) => typeof item?.link === 'string' && item.link.startsWith('https://'))
    .filter((item) => region !== 'CN' || isAllowedCnSource(item.link))
    .filter((item) => isVersionRelevant(item, request))
    .filter((item) => isPublishedInVersionWindow(item.publish_date, request))
    .filter((item) => isPlayerFeedbackResult(item))
    .slice(0, 6)
    .map((item, index) => {
      const source = sourceFromUrl(item.link)
      return {
        id: `live-${region.toLocaleLowerCase()}-${String(index + 1).padStart(3, '0')}`,
        source,
        sourceType: sourceType(source),
        region,
        language: languageFor(region),
        author: cleanString(item.media || source, 120) || source,
        title: cleanString(item.title, 300),
        url: item.link,
        excerptOriginal: cleanString(item.content || item.title, 1_600),
        excerptZh: cleanString(item.content || item.title, 1_600),
        sentiment: 'neutral',
        topics: [],
        confidence: 0,
        engagement: 0,
        publishedLabel: cleanString(item.publish_date, 40) || '公开页面',
        retrievedAt: new Date().toISOString(),
        synthetic: false,
      }
    })
}

function parseJsonObject(content) {
  const normalized = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = normalized.indexOf('{')
  const end = normalized.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Agent did not return a JSON object.')
  return JSON.parse(normalized.slice(start, end + 1))
}

async function requestAgentJson({ config, apiKey, fetchImpl, role, instruction, payload }) {
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `你是 ReHoYo 的${role}。你只能依据输入中的真实公开网页证据工作；不得补造评论、数量、URL 或事实。${instruction} 只返回合法 JSON 对象，不要 Markdown。`,
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.1,
      max_tokens: 3_600,
      stream: false,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(`${role}请求失败：${cleanString(result?.error?.message || `HTTP ${response.status}`, 220)}`)
  }
  const content = result?.choices?.[0]?.message?.content
  return parseJsonObject(content)
}

function validSentiment(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase()
  const aliases = {
    positive: 'positive',
    neutral: 'neutral',
    negative: 'negative',
    正面: 'positive',
    积极: 'positive',
    中性: 'neutral',
    负面: 'negative',
    消极: 'negative',
  }
  return aliases[normalized] || ''
}

function validRisk(value) {
  return ['low', 'medium', 'high', 'critical'].includes(value) ? value : 'medium'
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function evidenceForModel(evidence) {
  return evidence.map((item) => ({
    id: item.id,
    source: item.source,
    region: item.region,
    title: item.title,
    url: item.url,
    published: item.publishedLabel,
    original: item.excerptOriginal,
  }))
}

export function normalizeSentimentAnalyses(result) {
  const candidates = ['evidence', 'results', 'analyses', 'items', 'classifications']
    .map((key) => result?.[key])
    .find(Array.isArray)
  const records = candidates || ((result?.id || result?.evidenceId || result?.evidence_id) ? [result] : [])
  return records.map((item) => ({
    ...item,
    id: cleanString(item?.id || item?.evidenceId || item?.evidence_id, 120),
    sentiment: validSentiment(item?.sentiment || item?.sentimentLabel || item?.label),
    topics: Array.isArray(item?.topics) ? item.topics : Array.isArray(item?.reasons) ? item.reasons : [],
    confidence: clampNumber(item?.confidence, 0, 1, 0),
    excerptZh: cleanString(item?.excerptZh || item?.excerpt_zh || item?.translationZh, 1_600),
  })).filter((item) => item.id && item.sentiment)
}

export function applySentimentAnalysis(evidence, result) {
  const analyses = normalizeSentimentAnalyses(result)
  const byId = new Map(analyses.map((item) => [item.id, item]))
  const missingIds = evidence.map((item) => item.id).filter((id) => !byId.has(id))
  if (missingIds.length) {
    throw new Error(`情绪 Agent 返回结构无法映射 ${missingIds.length} 条证据：${missingIds.slice(0, 4).join(', ')}`)
  }
  return evidence.map((item) => {
    const analysis = byId.get(item.id)
    return {
      ...item,
      sentiment: analysis.sentiment,
      topics: Array.isArray(analysis.topics)
        ? analysis.topics.map((topic) => cleanString(topic, 60)).filter(Boolean).slice(0, 5)
        : [],
      confidence: clampNumber(analysis.confidence, 0, 1, 0),
      excerptZh: cleanString(analysis.excerptZh, 1_600) || item.excerptOriginal,
    }
  })
}

function derivePercentages(evidence) {
  const total = Math.max(evidence.length, 1)
  const positivePercent = Math.round((evidence.filter((item) => item.sentiment === 'positive').length / total) * 100)
  const negativePercent = Math.round((evidence.filter((item) => item.sentiment === 'negative').length / total) * 100)
  const neutralPercent = 100 - positivePercent - negativePercent
  const sentimentScore = Math.round(positivePercent + neutralPercent * 0.5)
  return { positivePercent, negativePercent, neutralPercent, sentimentScore }
}

function deriveKeywords(evidence) {
  const counts = new Map()
  for (const item of evidence) {
    for (const topic of item.topics) {
      const current = counts.get(topic) || { count: 0, sentiments: [] }
      current.count += 1
      current.sentiments.push(item.sentiment)
      counts.set(topic, current)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([label, value]) => ({
    label,
    weight: Math.min(100, 35 + value.count * 13),
    sentiment: value.sentiments.filter((item) => item === 'negative').length > value.sentiments.filter((item) => item === 'positive').length
      ? 'negative'
      : value.sentiments.includes('positive') ? 'positive' : 'neutral',
  }))
}

function sanitizeRegions(result, evidence) {
  const candidates = Array.isArray(result.regions) ? result.regions : []
  return ['CN', 'JP', 'WEST'].map((region) => {
    const candidate = candidates.find((item) => item?.region === region) || {}
    const regionalEvidence = evidence.filter((item) => item.region === region)
    const topics = deriveKeywords(regionalEvidence)
    return {
      region,
      label: cleanString(candidate.label, 30) || ({ CN: '中国', JP: '日本', WEST: '欧美' })[region],
      sentimentScore: derivePercentages(regionalEvidence).sentimentScore,
      sampleCount: regionalEvidence.length,
      topConcern: cleanString(candidate.topConcern, 80) || topics[0]?.label || '当前证据不足',
      secondaryConcern: cleanString(candidate.secondaryConcern, 80) || topics[1]?.label || '当前证据不足',
      insight: cleanString(candidate.insight, 600) || '当前公开证据不足以形成稳定的地区结论。',
    }
  })
}

function sanitizeEvidenceIds(ids, validIds) {
  return Array.isArray(ids) ? [...new Set(ids.filter((id) => validIds.has(id)))].slice(0, 12) : []
}

function buildGroundedSummary(evidence, percentages) {
  const regionCounts = Object.fromEntries(['CN', 'JP', 'WEST'].map((region) => [region, evidence.filter((item) => item.region === region).length]))
  const topics = deriveKeywords(evidence).slice(0, 3).map((item) => item.label)
  const topicClause = topics.length ? `高频议题为${topics.join('、')}。` : '当前证据尚未形成稳定的高频议题。'
  return `当前实时证据快照共 ${evidence.length} 条：正面 ${percentages.positivePercent}% · 中性 ${percentages.neutralPercent}% · 负面 ${percentages.negativePercent}%。覆盖中国 ${regionCounts.CN} 条、日本 ${regionCounts.JP} 条、欧美 ${regionCounts.WEST} 条；${topicClause}结论仅代表本次检索到的公开页面。`
}

function buildReport(evidence, regional, strategy) {
  if (!Array.isArray(strategy.controversies) || !strategy.controversies.length) {
    throw new Error('策略 Agent 未返回可追溯的争议结论。')
  }
  if (!Array.isArray(strategy.recommendations) || !strategy.recommendations.length) {
    throw new Error('策略 Agent 未返回可执行建议。')
  }
  const validIds = new Set(evidence.map((item) => item.id))
  const percentages = derivePercentages(evidence)
  const controversies = strategy.controversies.slice(0, 5).map((item, index) => ({
    id: `live-controversy-${index + 1}`,
    title: cleanString(item.title, 160),
    description: cleanString(item.description, 700),
    severity: validRisk(item.severity),
    region: ['GLOBAL', 'CN', 'JP', 'WEST'].includes(item.region) ? item.region : 'GLOBAL',
    evidenceIds: sanitizeEvidenceIds(item.evidenceIds, validIds),
    propagation: cleanString(item.propagation, 260) || '当前公开证据未形成可验证传播路径',
  })).filter((item) => item.title && item.description && item.evidenceIds.length)
  const recommendations = strategy.recommendations.slice(0, 6).map((item, index) => ({
    id: `live-recommendation-${index + 1}`,
    priority: ['P0', 'P1', 'P2'].includes(item.priority) ? item.priority : 'P1',
    title: cleanString(item.title, 160),
    action: cleanString(item.action, 700),
    rationale: cleanString(item.rationale, 500),
    region: ['GLOBAL', 'CN', 'JP', 'WEST'].includes(item.region) ? item.region : 'GLOBAL',
    evidenceIds: sanitizeEvidenceIds(item.evidenceIds, validIds),
  })).filter((item) => item.title && item.action && item.evidenceIds.length)
  if (!controversies.length || !recommendations.length) throw new Error('策略 Agent 的结论缺少有效证据引用。')

  return {
    summary: buildGroundedSummary(evidence, percentages),
    riskLevel: validRisk(strategy.riskLevel),
    sampleCount: evidence.length,
    ...percentages,
    trend: [{ label: '实时快照', positive: percentages.positivePercent, neutral: percentages.neutralPercent, negative: percentages.negativePercent }],
    regions: sanitizeRegions(regional, evidence),
    keywords: deriveKeywords(evidence),
    controversies,
    recommendations,
  }
}

function buildLiveAgents(durationMs) {
  return [
    { id: 'research', name: '社区研究 Agent', englishName: 'COMMUNITY RESEARCH', objective: '实时检索公开网页、Reddit RSS 与 Niconico，并保留原始 URL。', startOffsetMs: 0, endOffsetMs: Math.round(durationMs * 0.42), sources: ['Reddit RSS', 'Niconico', 'BigModel Web Search'], outputs: ['真实来源 URL', '页面摘要', '检索状态'] },
    { id: 'sentiment', name: '玩家情绪 Agent', englishName: 'SENTIMENT ANALYSIS', objective: '使用 GLM 对已检索证据逐条分类、翻译并提取原因主题。', startOffsetMs: Math.round(durationMs * 0.38), endOffsetMs: Math.round(durationMs * 0.7), sources: ['社区研究真实证据'], outputs: ['逐条情绪', '中文释义', '原因主题'] },
    { id: 'regional', name: '地区差异 Agent', englishName: 'REGIONAL ANALYSIS', objective: '使用 GLM 比较真实证据中的中、日、欧美关注点。', startOffsetMs: Math.round(durationMs * 0.38), endOffsetMs: Math.round(durationMs * 0.72), sources: ['分地区真实证据'], outputs: ['地区矩阵', '证据缺口', '文化语境'] },
    { id: 'strategy', name: '策略建议 Agent', englishName: 'STRATEGY SYNTHESIS', objective: '等待上游完成，以证据编号生成风险与建议。', startOffsetMs: Math.round(durationMs * 0.7), endOffsetMs: durationMs, sources: ['三个上游 Agent 输出'], outputs: ['争议风险', '优先级建议', '证据引用'] },
  ]
}

export async function runLiveResearch({
  config,
  request,
  onEvent = () => {},
  fetchImpl = fetch,
  readKeyFile = (keyFile) => readFile(keyFile, 'utf8'),
  now = Date.now,
}) {
  if (!config?.configured) throw new Error('Real research requires a configured GLM key file.')
  const safeRequest = sanitizeResearchRequest(request)
  const apiKey = String(await readKeyFile(config.keyFile)).trim()
  if (!apiKey) throw new Error('GLM API key file is empty.')
  const startedAt = now()
  const events = []
  const emit = (agentId, phase, kind, message, progress, evidenceIds = [], extras = {}) => {
    const event = {
      id: `live-event-${String(events.length + 1).padStart(3, '0')}`,
      offsetMs: Math.max(0, now() - startedAt),
      agentId,
      phase,
      kind,
      message,
      evidenceIds,
      progress,
      ...extras,
    }
    events.push(event)
    onEvent(event)
    return event
  }

  emit('research', 'research', 'status', '社区研究 Agent 已启动真实公开网络检索', 4)
  const retrievals = []
  if (safeRequest.regions.includes('WEST')) {
    retrievals.push(fetchRedditEvidence({ request: safeRequest, apiKey, fetchImpl }).then((items) => {
      emit('research', 'research', 'source', `Reddit RSS 返回 ${items.length} 条可核验讨论`, 28, items.map((item) => item.id), { source: 'Reddit RSS', region: 'WEST', evidenceRecords: items })
      return items
    }).catch((error) => {
      emit('research', 'research', 'risk', `Reddit RSS 访问失败：${cleanString(error.message, 140)}`, 24, [], { source: 'Reddit RSS', region: 'WEST', severity: 'medium' })
      return []
    }))
  }
  if (safeRequest.regions.includes('JP')) {
    retrievals.push(fetchNiconicoEvidence({ request: safeRequest, fetchImpl }).then((items) => {
      emit('research', 'research', 'source', `Niconico 官方快照返回 ${items.length} 条版本期日语页面`, 48, items.map((item) => item.id), { source: 'Niconico Snapshot', region: 'JP', evidenceRecords: items })
      return items
    }).catch((error) => {
      emit('research', 'research', 'risk', `Niconico 访问失败：${cleanString(error.message, 140)}`, 44, [], { source: 'Niconico', region: 'JP', severity: 'medium' })
      return []
    }))
  }
  for (const region of safeRequest.regions.filter((item) => item === 'CN')) {
    retrievals.push(fetchWebSearchEvidence({ request: safeRequest, region, apiKey, config, fetchImpl }).then((items) => {
      emit('research', 'research', 'source', `${region} 公开网页搜索返回 ${items.length} 条相关页面`, region === 'CN' ? 48 : 68, items.map((item) => item.id), { source: 'BigModel Web Search', region, evidenceRecords: items })
      return items
    }).catch((error) => {
      emit('research', 'research', 'risk', `${region} 搜索失败：${cleanString(error.message, 140)}`, 60, [], { source: 'BigModel Web Search', region, severity: 'high' })
      return []
    }))
  }
  const evidence = (await Promise.all(retrievals)).flat()
  if (!evidence.length) throw new Error('公开来源没有返回可核验证据；任务已停止，未使用演示数据补位。')
  emit('research', 'research', 'handoff', `真实检索完成，交接 ${evidence.length} 条带 URL 的公开证据`, 100, evidence.map((item) => item.id))

  emit('sentiment', 'sentiment', 'status', '玩家情绪 Agent 正在逐条分析真实证据', 8)
  emit('regional', 'regional', 'status', '地区差异 Agent 正在并行比较来源与语境', 8)
  const modelEvidence = evidenceForModel(evidence)
  const [sentiment, regional] = await Promise.all([
    requestAgentJson({
      config,
      apiKey,
      fetchImpl,
      role: '玩家情绪分析 Agent',
      instruction: '严格返回形如 {"summary":"...","analyses":[{"evidenceId":"输入 id","sentiment":"positive|neutral|negative","topics":["原因主题"],"confidence":0.0,"excerptZh":"忠实中文释义"}]}。analyses 必须逐条覆盖输入中的每一个 id，不多不少。',
      payload: { task: safeRequest, evidence: modelEvidence },
    }),
    requestAgentJson({
      config,
      apiKey,
      fetchImpl,
      role: '地区差异分析 Agent',
      instruction: '返回 regions 数组，包含 CN、JP、WEST；字段为 region、label、sentimentScore、topConcern、secondaryConcern、insight。没有证据的地区必须明确写证据不足。',
      payload: { task: safeRequest, evidence: modelEvidence },
    }).then((result) => {
      emit('regional', 'regional', 'handoff', '地区关注差异与证据缺口已完成', 100, evidence.map((item) => item.id))
      return result
    }),
  ])

  const analyzedEvidence = applySentimentAnalysis(evidence, sentiment)
  emit('sentiment', 'sentiment', 'handoff', '情绪分类、原因主题与中文释义已完成', 100, analyzedEvidence.map((item) => item.id), { evidenceRecords: analyzedEvidence })
  emit('strategy', 'strategy', 'status', '策略 Agent 已收到全部真实证据与上游结论', 16)
  const derivedMetrics = derivePercentages(analyzedEvidence)
  const strategy = await requestAgentJson({
    config,
    apiKey,
    fetchImpl,
    role: '策略建议 Agent',
    instruction: '返回 summary、riskLevel、controversies、recommendations。每条争议含 title、description、severity、region、evidenceIds、propagation；每条建议含 priority、title、action、rationale、region、evidenceIds。所有结论必须引用输入中存在的证据 id；描述不得与 derivedMetrics 的确定性统计矛盾。',
    payload: { task: safeRequest, derivedMetrics, sentimentSummary: sentiment.summary, regional, evidence: evidenceForModel(analyzedEvidence) },
  })
  const report = buildReport(analyzedEvidence, regional, strategy)
  emit('strategy', 'strategy', 'complete', '真实全球玩家洞察报告已生成', 100, analyzedEvidence.map((item) => item.id))

  const durationMs = Math.max(1, now() - startedAt)
  const sources = [...new Set(analyzedEvidence.map((item) => item.source))]
  return {
    id: `live-${startedAt}`,
    dataMode: 'live',
    game: { id: `live-${safeRequest.gameName}`, name: safeRequest.gameName, shortName: safeRequest.gameName.slice(0, 4).toUpperCase(), accent: '#67d8ee' },
    version: { id: `live-${safeRequest.versionLabel || 'update'}`, label: safeRequest.versionLabel || 'LIVE', title: safeRequest.versionTitle },
    durationMs,
    regions: safeRequest.regions,
    sources,
    agents: buildLiveAgents(durationMs),
    events,
    evidence: analyzedEvidence,
    report,
    advisorAnswers: [],
  }
}

export const LIVE_SEARCH_BASE_URL = SEARCH_BASE_URL
