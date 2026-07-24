import { readFile } from 'node:fs/promises'
import { jsonrepair } from 'jsonrepair'
import { collectWikiContext } from './wiki-context.mjs'

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

export const LIVE_SOURCE_CATALOG = Object.freeze([
  { id: 'bilibili', name: 'Bilibili', domains: ['bilibili.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'video', discovery: 'web', evidenceRole: 'player' },
  { id: 'miyoushe', name: '米游社', domains: ['miyoushe.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'baidu-tieba', name: '百度贴吧', domains: ['tieba.baidu.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'taptap-cn', name: 'TapTap', domains: ['taptap.cn'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'nga', name: 'NGA', domains: ['nga.cn'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'zhihu', name: '知乎', domains: ['zhihu.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: '17173', name: '17173', domains: ['17173.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'gamersky', name: '游民星空', domains: ['gamersky.com'], regions: ['CN'], markets: ['CN'], language: 'zh-CN', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },

  { id: 'niconico', name: 'Niconico', domains: ['nicovideo.jp'], regions: ['JP'], markets: ['JP'], language: 'ja-JP', sourceType: 'video', discovery: 'direct', evidenceRole: 'player' },
  { id: '5ch', name: '5ch', domains: ['5ch.net'], regions: ['JP'], markets: ['JP'], language: 'ja-JP', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'yahoo-chiebukuro', name: 'Yahoo!知恵袋', domains: ['chiebukuro.yahoo.co.jp'], regions: ['JP'], markets: ['JP'], language: 'ja-JP', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'gamewith-jp', name: 'GameWith', domains: ['gamewith.jp'], regions: ['JP'], markets: ['JP'], language: 'ja-JP', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'note-jp', name: 'note', domains: ['note.com'], regions: ['JP'], markets: ['JP'], language: 'ja-JP', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },

  { id: 'hoyoplay', name: 'HoYoPlay', domains: ['hoyoplay.hoyoverse.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'community', discovery: 'web', evidenceRole: 'context' },
  { id: 'hoyolab', name: 'HoYoLAB', domains: ['hoyolab.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'video', discovery: 'web', evidenceRole: 'player' },
  { id: 'reddit', name: 'Reddit', domains: ['reddit.com'], regions: ['WEST'], markets: ['NA', 'EU', 'GLOBAL'], language: 'en-US', sourceType: 'community', discovery: 'direct', evidenceRole: 'player' },
  { id: 'steam-community', name: 'Steam Community', domains: ['steamcommunity.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'google-play', name: 'Google Play', domains: ['play.google.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'store', discovery: 'web', evidenceRole: 'player' },
  { id: 'app-store', name: 'App Store', domains: ['apps.apple.com', 'itunes.apple.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'store', discovery: 'web', evidenceRole: 'player' },
  { id: 'gamefaqs', name: 'GameFAQs', domains: ['gamefaqs.gamespot.com'], regions: ['WEST'], markets: ['NA'], language: 'en-US', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'resetera', name: 'ResetEra', domains: ['resetera.com'], regions: ['WEST'], markets: ['NA', 'EU'], language: 'en-US', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'metacritic', name: 'Metacritic', domains: ['metacritic.com'], regions: ['WEST'], markets: ['NA', 'EU'], language: 'en-US', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'x', name: 'X', domains: ['x.com', 'twitter.com'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'twitch', name: 'Twitch', domains: ['twitch.tv'], regions: ['WEST'], markets: ['GLOBAL'], language: 'en-US', sourceType: 'video', discovery: 'web', evidenceRole: 'player' },

  { id: 'bahamut', name: '巴哈姆特', domains: ['gamer.com.tw'], regions: ['WEST'], markets: ['TW'], language: 'zh-TW', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'ptt', name: 'PTT', domains: ['ptt.cc'], regions: ['WEST'], markets: ['TW'], language: 'zh-TW', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'naver-cafe', name: 'Naver Cafe', domains: ['cafe.naver.com'], regions: ['WEST'], markets: ['KR'], language: 'ko-KR', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'dcinside', name: 'DCInside', domains: ['dcinside.com'], regions: ['WEST'], markets: ['KR'], language: 'ko-KR', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'inven', name: 'Inven', domains: ['inven.co.kr'], regions: ['WEST'], markets: ['KR'], language: 'ko-KR', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'jeuxvideo', name: 'Jeuxvideo.com', domains: ['jeuxvideo.com'], regions: ['WEST'], markets: ['EU'], language: 'fr-FR', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'mein-mmo', name: 'MeinMMO', domains: ['mein-mmo.de'], regions: ['WEST'], markets: ['EU'], language: 'de-DE', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'dtf', name: 'DTF', domains: ['dtf.ru'], regions: ['WEST'], markets: ['RU'], language: 'ru-RU', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: 'vk', name: 'VK', domains: ['vk.com'], regions: ['WEST'], markets: ['RU'], language: 'ru-RU', sourceType: 'community', discovery: 'web', evidenceRole: 'player' },
  { id: '3djuegos', name: '3DJuegos', domains: ['3djuegos.com'], regions: ['WEST'], markets: ['EU'], language: 'es-ES', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'vandal', name: 'Vandal', domains: ['vandal.elespanol.com'], regions: ['WEST'], markets: ['EU'], language: 'es-ES', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
  { id: 'adrenaline', name: 'Adrenaline', domains: ['adrenaline.com.br'], regions: ['WEST'], markets: ['BR'], language: 'pt-BR', sourceType: 'forum', discovery: 'web', evidenceRole: 'player' },
])

const DEFAULT_MINIMUM_SITES = 30
const DEFAULT_MINIMUM_EVIDENCE = 30
const DEFAULT_SEARCH_CONCURRENCY = 12
const SEARCH_PROVIDERS = Object.freeze(['brave', 'bigmodel'])

function cleanString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function assertVerifiedEvidence(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) {
    throw new Error('真实研究至少需要一条可验证公开证据。')
  }
  const ids = new Set()
  for (const item of evidence) {
    let isHttps = false
    try {
      isHttps = new URL(item?.url).protocol === 'https:'
    } catch {
      isHttps = false
    }
    if (
      !item?.id || ids.has(item.id) || item.synthetic !== false || !isHttps ||
      !cleanString(item.excerptOriginal, 1_600) || !Number.isFinite(Date.parse(item.retrievedAt))
    ) {
      throw new Error('检索结果包含不可验证、重复或缺少原始摘录的记录；任务已停止。')
    }
    ids.add(item.id)
  }
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

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value ?? '')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function rotate(items, offset) {
  if (!items.length) return []
  const normalized = Math.abs(offset) % items.length
  return [...items.slice(normalized), ...items.slice(0, normalized)]
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

function normalizedHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLocaleLowerCase()
  } catch {
    return ''
  }
}

function hostnameMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function sourceDefinitionFromUrl(url) {
  const hostname = normalizedHostname(url)
  if (!hostname) return undefined
  return LIVE_SOURCE_CATALOG.find((source) => source.domains.some((domain) => hostnameMatches(hostname, domain)))
}

export function sourceFromUrl(url) {
  return sourceDefinitionFromUrl(url)?.name || normalizedHostname(url)
}

function sourceType(source) {
  return LIVE_SOURCE_CATALOG.find((item) => item.name === source)?.sourceType || 'forum'
}

function languageFor(region) {
  if (region === 'CN') return 'zh-CN'
  if (region === 'JP') return 'ja-JP'
  return 'en-US'
}

function localizedSearchBase(request, language) {
  const key = `${request.gameName}|${request.versionLabel}`
  if (language === 'zh-CN') {
    return CHINESE_SEARCH_TERMS.get(key)
      || `${request.gameName} ${request.versionLabel} ${request.versionTitle} 中国 玩家 评价 体验`.trim()
  }
  if (language === 'ja-JP') {
    const terms = JAPANESE_SEARCH_TERMS.get(key) || [request.gameName, request.versionTitle]
    return `${terms.join(' ')} ${request.versionLabel} 感想 評価 プレイ`.trim()
  }

  const western = WESTERN_SEARCH_TERMS.get(key)
    || `${gameAlias(request.gameName)} ${request.versionLabel} ${request.versionTitle} feedback`.trim()
  const localizedSuffix = {
    'zh-TW': '玩家 心得 評價 體驗',
    'ko-KR': '플레이어 후기 평가 반응',
    'fr-FR': 'avis joueurs expérience',
    'de-DE': 'Spieler Meinung Erfahrung',
    'ru-RU': 'отзывы игроков впечатления',
    'es-ES': 'opiniones jugadores experiencia',
    'pt-BR': 'avaliação jogadores experiência',
  }[language]
  return `${western} ${localizedSuffix || 'player review experience'}`.trim()
}

function localizedQueryVariants(request, language) {
  const base = localizedSearchBase(request, language)
  const exact = [request.gameName, request.versionLabel, request.versionTitle].filter(Boolean).join(' ')
  const variants = {
    'zh-CN': [`${base} 玩家评论`, `${exact} 讨论 评价`, `${exact} 剧情 角色 强度 体验`],
    'zh-TW': [`${base} 玩家留言`, `${exact} 討論 評價`, `${exact} 劇情 角色 體驗`],
    'ja-JP': [`${base} コメント`, `${exact} 感想 評価`, `${exact} ストーリー キャラ 反応`],
    'ko-KR': [`${base} 댓글`, `${exact} 유저 반응 후기`, `${exact} 스토리 캐릭터 평가`],
    'fr-FR': [`${base} commentaires`, `${exact} avis communauté`, `${exact} histoire personnages réactions`],
    'de-DE': [`${base} Kommentare`, `${exact} Community Meinung`, `${exact} Story Charakter Reaktionen`],
    'ru-RU': [`${base} комментарии`, `${exact} отзывы сообщества`, `${exact} сюжет персонажи реакция`],
    'es-ES': [`${base} comentarios`, `${exact} opiniones comunidad`, `${exact} historia personajes reacciones`],
    'pt-BR': [`${base} comentários`, `${exact} opinião comunidade`, `${exact} história personagens reações`],
    'en-US': [`${base} comments`, `${exact} community opinions`, `${exact} story character gameplay reactions`],
  }[language] || [`${base} comments`, `${exact} player opinions`]
  return [...new Set(variants.map((value) => value.trim()).filter(Boolean))]
}

export function buildSourceSearchPlans(request, region, runSeed = 'default') {
  const matchingSources = LIVE_SOURCE_CATALOG.filter((source) => source.discovery === 'web' && source.regions.includes(region))
  const sources = rotate(matchingSources, stableHash(`${runSeed}:${region}`))
  return sources.map((source, index) => {
    const domains = [...new Set(source.domains)]
    const siteRestriction = domains.map((domain) => `site:${domain}`).join(' OR ')
    const queries = localizedQueryVariants(request, source.language)
      .map((query) => `${query} (${siteRestriction})`)
    return {
      id: `${region.toLocaleLowerCase()}-${source.id}`,
      sourceId: source.id,
      region,
      language: source.language,
      sourceNames: [source.name],
      domains,
      query: queries[0],
      queries,
      evidenceOffset: (region === 'CN' ? 0 : region === 'JP' ? 10_000 : 20_000)
        + matchingSources.findIndex((candidate) => candidate.id === source.id) * 100,
    }
  })
}

export function parseBraveSearchResults(html) {
  const source = String(html ?? '')
  const starts = [...source.matchAll(/<div\s+class=["'][^"']*\bsnippet\b[^"']*["'][^>]*data-pos=["'][^"']+["'][^>]*data-type=["']web["'][^>]*>/gi)]
  const records = []
  starts.forEach((match, index) => {
    const chunk = source.slice(match.index, starts[index + 1]?.index ?? source.length)
    const url = decodeXmlEntities(chunk.match(/<a\s+[^>]*href=["'](https:\/\/[^"']+)["']/i)?.[1] || '')
    const title = textFromHtml(chunk.match(/<div\s+class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '')
    const publishedAt = textFromHtml(chunk.match(/<span\s+class=["'][^"']*\bt-secondary\b[^"']*["'][^>]*>([\s\S]*?)\s+-\s*<\/span>/i)?.[1] || '')
    const replies = [...chunk.matchAll(/<div\s+class=["'][^"']*\binline-qa-answer\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((reply) => textFromHtml(reply[1]))
      .filter((value) => value.length >= 12)
    const fallback = textFromHtml(
      chunk.match(/<div\s+class=["'][^"']*(?:snippet-description|inline-qa-question)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '',
    )
    const contents = replies.length ? replies : fallback.length >= 24 ? [fallback] : []
    if (!url.startsWith('https://') || !title || !contents.length) return
    contents.slice(0, 5).forEach((content) => records.push({
      url,
      title,
      publishedAt,
      content,
      contentKind: replies.length ? 'comment' : 'post',
    }))
  })
  return records
}

function isSourceInPlan(url, plan) {
  const hostname = normalizedHostname(url)
  return Boolean(hostname) && plan.domains.some((domain) => hostnameMatches(hostname, domain))
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

export function isSearchResultVersionGrounded(item, request) {
  if (!isVersionRelevant(item, request)) return false
  const publishedAt = cleanString(item?.publish_date || item?.publishedAt || item?.published_at, 100)
  if (publishedAt) return isPublishedInVersionWindow(publishedAt, request)
  return true
}

export function isPlayerFeedbackResult(item) {
  const haystack = normalizeSearchText(`${item?.title || ''} ${item?.content || ''}`)
  const metricsOnly = ['sensortower', 'revenue', 'sales chart', 'monthly income', 'made more money', 'grossing', '流水', '营收']
    .some((term) => haystack.includes(normalizeSearchText(term)))
  const experienceTerms = [
    'feedback', 'review', 'thoughts', 'opinion', 'experience', 'exploration', 'gameplay', 'combat', 'story', 'quest', 'character', 'pacing',
    '感想', 'レビュー', '実況', 'プレイ', '探索', '戦闘', 'ストーリー', '伝説任務', 'キャラ', 'ムアラニ', 'カチーナ', 'キィニチ', 'ピノコニー', 'ジェーン',
    '评价', '体验', '实测', '感受', '剧情', '探索', '战斗', '角色', '任务', '玛拉妮', '卡齐娜', '基尼奇', '匹诺康尼', '青衣',
    '心得', '評價', '體驗', '劇情', '戰鬥', '角色',
    '후기', '평가', '반응', '경험', '탐험', '전투', '스토리', '캐릭터',
    'avis', 'expérience', 'jouabilité', 'histoire', 'personnage',
    'meinung', 'erfahrung', 'bewertung', 'geschichte', 'charakter',
    'отзыв', 'отзывы', 'впечатления', 'сюжет', 'персонаж',
    'opinión', 'opiniones', 'experiencia', 'historia', 'personaje',
    'avaliação', 'opinião', 'experiência', 'história', 'personagem',
  ]
  const experienceMatches = experienceTerms.filter((term) => haystack.includes(normalizeSearchText(term))).length
  return !metricsOnly && experienceMatches > 0
}

function evidenceDedupeKey(item) {
  let canonicalUrl = cleanString(item?.url, 2_000)
  try {
    const url = new URL(canonicalUrl)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|share$)/i.test(key)) url.searchParams.delete(key)
    }
    canonicalUrl = url.toString()
  } catch {
    // Invalid URLs are rejected by assertVerifiedEvidence after collection.
  }
  return `${canonicalUrl}\n${normalizeSearchText(item?.excerptOriginal).slice(0, 500)}`
}

export async function collectResearchCoverage({
  plans,
  retrieve,
  minimumSites = DEFAULT_MINIMUM_SITES,
  minimumEvidence = DEFAULT_MINIMUM_EVIDENCE,
  concurrency = DEFAULT_SEARCH_CONCURRENCY,
  providers = SEARCH_PROVIDERS,
  onAttempt = () => {},
}) {
  const safePlans = Array.isArray(plans) ? plans.filter((plan) => plan?.sourceId && Array.isArray(plan?.queries) && plan.queries.length) : []
  const safeProviders = Array.isArray(providers) && providers.length
    ? providers.filter((provider) => SEARCH_PROVIDERS.includes(provider))
    : [...SEARCH_PROVIDERS]
  if (!safePlans.length || !safeProviders.length || typeof retrieve !== 'function') {
    throw new Error('Adaptive research requires source plans, providers, and a retrieval function.')
  }

  const siteIds = new Set()
  const evidenceByKey = new Map()
  const attempts = []
  const maxRounds = Math.max(...safePlans.map((plan) => plan.queries.length))
  const batchSize = Math.max(1, Math.min(12, Math.floor(Number(concurrency) || DEFAULT_SEARCH_CONCURRENCY)))

  for (let round = 0; round < maxRounds; round += 1) {
    for (let cursor = 0; cursor < safePlans.length; cursor += batchSize) {
      const batch = safePlans.slice(cursor, cursor + batchSize)
      const outcomes = await Promise.all(batch.map(async (plan, batchIndex) => {
        const planIndex = cursor + batchIndex
        const provider = safeProviders[(planIndex + round) % safeProviders.length]
        const query = plan.queries[Math.min(round, plan.queries.length - 1)]
        const attempt = {
          id: `${plan.id}-${provider}-${round + 1}`,
          plan,
          provider,
          query,
          round,
          records: [],
          error: '',
        }
        try {
          const records = await retrieve({ plan, provider, query, round })
          attempt.records = Array.isArray(records) ? records : []
        } catch (error) {
          attempt.error = cleanString(error instanceof Error ? error.message : error, 220)
        }
        return attempt
      }))

      for (const attempt of outcomes) {
        attempts.push(attempt)
        siteIds.add(attempt.plan.sourceId)
        for (const item of attempt.records) {
          const key = evidenceDedupeKey(item)
          if (key.trim() && !evidenceByKey.has(key)) evidenceByKey.set(key, item)
        }
        onAttempt(attempt, {
          sitesAttempted: siteIds.size,
          evidenceCount: evidenceByKey.size,
        })
      }

      if (siteIds.size >= minimumSites && evidenceByKey.size >= minimumEvidence) {
        return {
          evidence: [...evidenceByKey.values()],
          attempts,
          sitesAttempted: siteIds.size,
          targetReached: true,
        }
      }
    }
  }

  return {
    evidence: [...evidenceByKey.values()],
    attempts,
    sitesAttempted: siteIds.size,
    targetReached: siteIds.size >= minimumSites && evidenceByKey.size >= minimumEvidence,
  }
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

function searchEvidenceId(plan, provider, round, index) {
  const providerOffset = provider === 'brave' ? 50 : 0
  return `live-${plan.region.toLocaleLowerCase()}-${String(plan.evidenceOffset + round * 10 + providerOffset + index + 1).padStart(3, '0')}`
}

function mapSearchEvidence(items, { request, plan, provider, round }) {
  return items
    .map((item) => ({
      ...item,
      link: item?.link || item?.url,
      content: item?.content || item?.description,
      publish_date: item?.publish_date || item?.publishedAt,
    }))
    .filter((item) => typeof item?.link === 'string' && item.link.startsWith('https://'))
    .filter((item) => isSourceInPlan(item.link, plan))
    .filter((item) => sourceDefinitionFromUrl(item.link)?.evidenceRole === 'player')
    .filter((item) => isSearchResultVersionGrounded(item, request))
    .filter((item) => isPlayerFeedbackResult(item))
    .slice(0, 8)
    .map((item, index) => {
      const sourceDefinition = sourceDefinitionFromUrl(item.link)
      const source = sourceDefinition?.name || sourceFromUrl(item.link)
      return {
        id: searchEvidenceId(plan, provider, round, index),
        source,
        sourceType: sourceDefinition?.sourceType || sourceType(source),
        region: plan.region,
        language: sourceDefinition?.language || languageFor(plan.region),
        author: cleanString(item.author || item.media || `${source} user`, 120) || `${source} user`,
        title: cleanString(item.title, 300),
        url: item.link,
        excerptOriginal: cleanString(item.content || item.title, 1_600),
        excerptZh: cleanString(item.content || item.title, 1_600),
        sentiment: 'neutral',
        topics: [],
        confidence: 0,
        engagement: clampNumber(item.engagement, 0, Number.MAX_SAFE_INTEGER, 0),
        publishedLabel: cleanString(item.publish_date, 40) || '公开页面 · 日期未提供',
        retrievedAt: new Date().toISOString(),
        contentKind: item.contentKind === 'comment' ? 'comment' : 'post',
        discoveryProvider: provider,
        synthetic: false,
      }
    })
}

async function fetchBigModelSearchEvidence({ request, plan, query, round, apiKey, config, fetchImpl }) {
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
      count: 20,
      content_size: 'high',
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`BigModel Web Search failed: ${cleanString(payload?.error?.message || `HTTP ${response.status}`, 220)}`)
  }

  const results = Array.isArray(payload.search_result) ? payload.search_result : []
  return mapSearchEvidence(results, { request, plan, provider: 'bigmodel', round })
}

async function fetchBraveSearchEvidence({ request, plan, query, round, fetchImpl }) {
  const url = new URL('https://search.brave.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('source', 'web')
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': `${plan.language},en;q=0.7`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36 ReHoYo/0.1',
    },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Brave Search returned HTTP ${response.status}.`)
  const html = await response.text()
  if (/captcha|verify you are human|cf-turnstile/i.test(html)) {
    throw new Error('Brave Search requested manual verification; this source round was paused rather than bypassed.')
  }
  return mapSearchEvidence(parseBraveSearchResults(html), { request, plan, provider: 'brave', round })
}

export function parseAgentJson(content) {
  const normalized = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = normalized.indexOf('{')
  const end = normalized.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Agent did not return a JSON object.')
  const candidate = normalized.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch (parseError) {
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      throw new Error(`Agent 返回的 JSON 无法修复：${cleanString(parseError instanceof Error ? parseError.message : 'invalid JSON', 180)}`)
    }
  }
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
          content: `你是 ReHoYo 的${role}。你只能依据输入中的真实公开网页证据工作；不得补造评论、数量、URL 或事实。RAG 中 role=player 的内容可作为玩家观点线索；role=context 的 Wiki 内容只用于理解人物、地点和版本背景，绝不能当作玩家评论、情绪或争议证据。${instruction} 只返回合法 JSON 对象，不要 Markdown。`,
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
  return parseAgentJson(content)
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
  return ['low', 'medium', 'high', 'critical'].includes(value) ? value : 'low'
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

function ragContextForModel(records) {
  return (Array.isArray(records) ? records : []).map((item) => ({
    documentId: cleanString(item.documentId, 200),
    role: item.role === 'player' ? 'player' : 'context',
    source: cleanString(item.source, 120),
    region: cleanString(item.region, 20),
    title: cleanString(item.title, 500),
    url: cleanString(item.url, 2_000),
    content: cleanString(item.content, 1_600),
  }))
}

function playerDocumentsForRag(evidence, observedByUrl) {
  return evidence.map((item) => {
    const observed = observedByUrl.get(item.url)
    return {
      id: item.id,
      role: 'player',
      source: item.source,
      region: item.region,
      language: item.language,
      title: observed?.title || item.title || item.source,
      url: item.url,
      text: observed?.text || item.excerptOriginal,
      retrievedAt: observed?.retrievedAt || item.retrievedAt,
    }
  })
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

function sanitizeRegions(evidence) {
  return ['CN', 'JP', 'WEST'].map((region) => {
    const regionalEvidence = evidence.filter((item) => item.region === region)
    const topics = deriveKeywords(regionalEvidence)
    const percentages = derivePercentages(regionalEvidence)
    return {
      region,
      label: ({ CN: '中国', JP: '日本', WEST: '欧美' })[region],
      sentimentScore: percentages.sentimentScore,
      sampleCount: regionalEvidence.length,
      topConcern: topics[0]?.label || '当前证据不足',
      secondaryConcern: topics[1]?.label || '当前证据不足',
      insight: regionalEvidence.length
        ? `本次检索到 ${regionalEvidence.length} 条可验证公开页面；正面 ${percentages.positivePercent}%、中性 ${percentages.neutralPercent}%、负面 ${percentages.negativePercent}%。`
        : '本次检索未获得该地区的可验证公开页面，不能形成地区结论。',
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

function buildReport(evidence, _regional, strategy) {
  const validIds = new Set(evidence.map((item) => item.id))
  const percentages = derivePercentages(evidence)
  const controversies = (Array.isArray(strategy.controversies) ? strategy.controversies : []).slice(0, 5).map((item, index) => {
    const evidenceIds = sanitizeEvidenceIds(item.evidenceIds, validIds)
    const citedSources = [...new Set(evidence
      .filter((record) => evidenceIds.includes(record.id))
      .map((record) => record.source))]
    return {
      id: `live-controversy-${index + 1}`,
      title: cleanString(item.title, 160),
      description: cleanString(item.description, 700),
      severity: validRisk(item.severity),
      region: ['GLOBAL', 'CN', 'JP', 'WEST'].includes(item.region) ? item.region : 'GLOBAL',
      evidenceIds,
      propagation: citedSources.length > 1 ? citedSources.join(' → ') : '未验证传播路径',
    }
  }).filter((item) => item.title && item.description && item.evidenceIds.length >= 2)
  const recommendations = (Array.isArray(strategy.recommendations) ? strategy.recommendations : []).slice(0, 6).map((item, index) => ({
    id: `live-recommendation-${index + 1}`,
    priority: ['P0', 'P1', 'P2'].includes(item.priority) ? item.priority : 'P1',
    title: cleanString(item.title, 160),
    action: cleanString(item.action, 700),
    rationale: cleanString(item.rationale, 500),
    region: ['GLOBAL', 'CN', 'JP', 'WEST'].includes(item.region) ? item.region : 'GLOBAL',
    evidenceIds: sanitizeEvidenceIds(item.evidenceIds, validIds),
  })).filter((item) => item.title && item.action && item.evidenceIds.length)
  const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 }
  const riskLevel = controversies.reduce(
    (highest, item) => riskOrder[item.severity] > riskOrder[highest] ? item.severity : highest,
    'low',
  )

  return {
    summary: buildGroundedSummary(evidence, percentages),
    riskLevel,
    sampleCount: evidence.length,
    ...percentages,
    trend: [{ label: '实时快照', positive: percentages.positivePercent, neutral: percentages.neutralPercent, negative: percentages.negativePercent }],
    regions: sanitizeRegions(evidence),
    keywords: deriveKeywords(evidence),
    controversies,
    recommendations,
  }
}

function buildLiveAgents(durationMs) {
  return [
    { id: 'research', name: '社区研究 Agent', englishName: 'COMMUNITY RESEARCH', objective: '按地区检索 30+ 个公开站点、Reddit RSS 与 Niconico，并保留原始 URL。', startOffsetMs: 0, endOffsetMs: Math.round(durationMs * 0.42), sources: ['30+ 个站点限定搜索', 'Reddit RSS', 'Niconico Snapshot'], outputs: ['真实来源 URL', '页面摘要', '检索状态'] },
    { id: 'sentiment', name: '玩家情绪 Agent', englishName: 'SENTIMENT ANALYSIS', objective: '使用 GLM 对已检索证据逐条分类、翻译并提取原因主题。', startOffsetMs: Math.round(durationMs * 0.38), endOffsetMs: Math.round(durationMs * 0.7), sources: ['社区研究真实证据'], outputs: ['逐条情绪', '中文释义', '原因主题'] },
    { id: 'regional', name: '地区差异 Agent', englishName: 'REGIONAL ANALYSIS', objective: '使用 GLM 比较真实证据中的中、日、欧美关注点。', startOffsetMs: Math.round(durationMs * 0.38), endOffsetMs: Math.round(durationMs * 0.72), sources: ['分地区真实证据'], outputs: ['地区矩阵', '证据缺口', '文化语境'] },
    { id: 'strategy', name: '策略建议 Agent', englishName: 'STRATEGY SYNTHESIS', objective: '等待上游完成，以证据编号生成风险与建议。', startOffsetMs: Math.round(durationMs * 0.7), endOffsetMs: durationMs, sources: ['三个上游 Agent 输出'], outputs: ['争议风险', '优先级建议', '证据引用'] },
  ]
}

function interleavePlans(groups, seed) {
  const queues = rotate(groups.map((group) => [...group]).filter((group) => group.length), stableHash(seed))
  const result = []
  while (queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next) result.push(next)
    }
  }
  return result
}

function selectBalancedEvidence(evidence, limit) {
  if (evidence.length <= limit) return evidence
  const queues = ['CN', 'JP', 'WEST'].map((region) => evidence.filter((item) => item.region === region))
  const selected = []
  while (selected.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next) selected.push(next)
      if (selected.length >= limit) break
    }
  }
  return selected
}

export async function runLiveResearch({
  config,
  request,
  onEvent = () => {},
  fetchImpl = fetch,
  getApiKey,
  readKeyFile = (keyFile) => readFile(keyFile, 'utf8'),
  now = Date.now,
  runSeed = 'default',
  coveragePolicy = {},
  ragStore,
  createResearchBrowser,
  collectWikiContextImpl = collectWikiContext,
}) {
  if (!config?.configured) throw new Error('Real research requires a configured GLM key file.')
  const safeRequest = sanitizeResearchRequest(request)
  const apiKey = String(getApiKey ? await getApiKey() : await readKeyFile(config.keyFile)).trim()
  if (!apiKey) throw new Error('GLM API key is empty.')
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

  const minimumEvidence = Math.max(1, Math.floor(coveragePolicy.minimumEvidence || DEFAULT_MINIMUM_EVIDENCE))
  const requestedMinimumSites = Math.max(1, Math.floor(coveragePolicy.minimumSites || DEFAULT_MINIMUM_SITES))
  const maxEvidence = Math.max(minimumEvidence, Math.floor(coveragePolicy.maxEvidence || 48))
  const providers = coveragePolicy.providers || SEARCH_PROVIDERS
  emit('research', 'research', 'status', `社区研究 Agent 已启动自适应真实检索：目标 ${requestedMinimumSites}+ 站点、${minimumEvidence}+ 条玩家证据`, 4)
  const directRetrievals = []
  if (safeRequest.regions.includes('WEST')) {
    directRetrievals.push(fetchRedditEvidence({ request: safeRequest, apiKey, fetchImpl }).then((items) => {
      emit('research', 'research', 'source', `Reddit RSS 返回 ${items.length} 条可核验讨论`, 28, items.map((item) => item.id), { source: 'Reddit RSS', region: 'WEST', evidenceRecords: items })
      return items
    }).catch((error) => {
      emit('research', 'research', 'risk', `Reddit RSS 访问失败：${cleanString(error.message, 140)}`, 24, [], { source: 'Reddit RSS', region: 'WEST', severity: 'medium' })
      return []
    }))
  }
  if (safeRequest.regions.includes('JP')) {
    directRetrievals.push(fetchNiconicoEvidence({ request: safeRequest, fetchImpl }).then((items) => {
      emit('research', 'research', 'source', `Niconico 官方快照返回 ${items.length} 条版本期日语页面`, 48, items.map((item) => item.id), { source: 'Niconico Snapshot', region: 'JP', evidenceRecords: items })
      return items
    }).catch((error) => {
      emit('research', 'research', 'risk', `Niconico 访问失败：${cleanString(error.message, 140)}`, 44, [], { source: 'Niconico', region: 'JP', severity: 'medium' })
      return []
    }))
  }
  const directEvidence = (await Promise.all(directRetrievals)).flat()
  const searchPlans = interleavePlans(
    safeRequest.regions.map((region) => buildSourceSearchPlans(safeRequest, region, runSeed)),
    runSeed,
  )
  const minimumSites = Math.min(requestedMinimumSites, searchPlans.length)
  const coverage = await collectResearchCoverage({
    plans: searchPlans,
    minimumSites,
    minimumEvidence: Math.max(0, minimumEvidence - directEvidence.length),
    concurrency: coveragePolicy.concurrency || DEFAULT_SEARCH_CONCURRENCY,
    providers,
    retrieve: ({ plan, provider, query, round }) => provider === 'brave'
      ? fetchBraveSearchEvidence({ request: safeRequest, plan, query, round, fetchImpl })
      : fetchBigModelSearchEvidence({ request: safeRequest, plan, query, round, apiKey, config, fetchImpl }),
    onAttempt: (attempt, stats) => {
      const providerLabel = attempt.provider === 'brave' ? 'Brave Search' : 'BigModel Search'
      const progress = Math.min(88, 18 + Math.round((stats.sitesAttempted / Math.max(1, minimumSites)) * 52))
      const message = attempt.error
        ? `${attempt.plan.region} · ${attempt.plan.sourceNames[0]} · ${providerLabel} 第 ${attempt.round + 1} 轮失败：${attempt.error}`
        : `${attempt.plan.region} · ${attempt.plan.sourceNames[0]} · ${providerLabel} 第 ${attempt.round + 1} 轮：新增 ${attempt.records.length} 条；已搜索 ${stats.sitesAttempted} 站 / 累计 ${stats.evidenceCount + directEvidence.length} 条`
      emit('research', 'research', attempt.error ? 'risk' : 'source', message, progress, attempt.records.map((item) => item.id), {
        source: `${attempt.plan.sourceNames[0]} · ${providerLabel}`,
        region: attempt.plan.region,
        severity: attempt.error ? 'medium' : undefined,
        evidenceRecords: attempt.records,
        searchProvider: attempt.provider,
        query: attempt.query,
        sitesAttempted: stats.sitesAttempted,
        evidenceCount: stats.evidenceCount + directEvidence.length,
      })
    },
  })
  const combined = new Map()
  for (const item of [...directEvidence, ...coverage.evidence]) {
    const key = evidenceDedupeKey(item)
    if (!combined.has(key)) combined.set(key, item)
  }
  const allEvidence = [...combined.values()]
  if (!allEvidence.length) throw new Error('公开来源没有返回可核验证据；任务已停止，未生成替代评论。')
  const targetReached = coverage.targetReached && allEvidence.length >= minimumEvidence
  if (!targetReached) emit('research', 'research', 'risk', `已完成可用来源检索，但样本未达到目标：搜索 ${coverage.sitesAttempted} 个站点，取得 ${allEvidence.length} 条可核验玩家证据。后续结论将降级并明确显示证据不足。`, 92, allEvidence.map((item) => item.id), { severity: 'high', sitesAttempted: coverage.sitesAttempted, evidenceCount: allEvidence.length })
  const evidence = selectBalancedEvidence(allEvidence, maxEvidence)
  assertVerifiedEvidence(evidence)
  let wikiDocuments = []
  let browserDocuments = []
  let ragStats = { documents: 0, contextDocuments: 0, playerDocuments: 0, chunks: 0 }
  const ragEnabled = Boolean(ragStore)
  if (ragEnabled || createResearchBrowser) {
    wikiDocuments = await collectWikiContextImpl({
      request: safeRequest,
      fetchImpl,
      now,
      onSource: (result) => emit(
        'research',
        'research',
        result.ok ? 'source' : 'risk',
        result.ok ? `${result.source} 收集 ${result.count} 篇版本背景资料` : `${result.source} 暂时不可用：${result.error}`,
        93,
        [],
        { source: result.source, region: 'GLOBAL', severity: result.ok ? undefined : 'medium' },
      ),
    })
  }
  if (createResearchBrowser) {
    const researchBrowser = createResearchBrowser({
      maxConcurrency: Math.max(1, Math.min(12, Math.floor(coveragePolicy.browserConcurrency || 4))),
      onObservation: (observation) => {
        const statusLabels = {
          navigating: '正在无头访问',
          completed: '已观察并提取',
          challenge_waiting: '遇到人机验证，已暂停该页',
          failed: '页面观察失败',
        }
        emit('research', 'research', 'browser', `${statusLabels[observation.status] || '浏览器状态更新'}：${observation.title || observation.source}`, 94, [], {
          source: observation.source,
          region: observation.region || 'GLOBAL',
          browserUrl: observation.url,
          browserTitle: observation.title,
          browserStatus: observation.status,
          browserPreview: observation.textPreview,
          browserPageId: observation.pageId,
          browserAction: observation.action,
          browserScreenshot: observation.screenshotDataUrl,
          severity: observation.status === 'failed' ? 'medium' : undefined,
        })
      },
    })
    const playerTargets = evidence.slice(0, Math.max(1, Math.min(16, Math.floor(coveragePolicy.browserPlayerPages || 12)))).map((item) => ({
      id: item.id,
      url: item.url,
      role: 'player',
      source: item.source,
      region: item.region,
      language: item.language,
      title: item.title,
    }))
    browserDocuments = await researchBrowser.observe([...wikiDocuments.slice(0, 8), ...playerTargets], { runId: runSeed, agentId: 'research' })
  }
  const observedByUrl = new Map(browserDocuments.map((document) => [document.url, document]))
  const contextDocuments = wikiDocuments.map((document) => observedByUrl.get(document.url) || document)
  if (ragEnabled) {
    ragStore.indexDocuments({
      runId: runSeed,
      game: safeRequest.gameName,
      version: safeRequest.versionLabel,
      documents: [...contextDocuments, ...playerDocumentsForRag(evidence, observedByUrl)],
    })
    ragStats = ragStore.getStats(runSeed)
    emit('research', 'research', 'rag', `本地知识库已写入 ${ragStats.documents} 篇文档、${ragStats.chunks} 个可检索片段`, 96, evidence.map((item) => item.id), {
      ragDocuments: ragStats.documents,
      ragChunks: ragStats.chunks,
      wikiDocuments: ragStats.contextDocuments,
    })
  }
  emit('research', 'research', 'handoff', `${targetReached ? '覆盖目标达成' : '降级交接'}：已搜索 ${coverage.sitesAttempted} 个站点，交接 ${evidence.length} 条带 URL 的真实玩家证据`, 100, evidence.map((item) => item.id), {
    sitesAttempted: coverage.sitesAttempted,
    evidenceCount: evidence.length,
    providers: [...new Set(coverage.attempts.map((attempt) => attempt.provider))],
  })

  emit('sentiment', 'sentiment', 'status', '玩家情绪 Agent 正在逐条分析真实证据', 8)
  emit('regional', 'regional', 'status', '地区差异 Agent 正在并行比较来源与语境', 8)
  const modelEvidence = evidenceForModel(evidence)
  const sentimentRag = ragEnabled ? ragStore.retrieve(`${safeRequest.gameName} ${safeRequest.versionTitle} 玩家喜欢 不满 情绪 原因`, { runId: runSeed, roles: ['player', 'context'], limit: 10 }) : []
  const regionalRag = ragEnabled ? ragStore.retrieve(`${safeRequest.gameName} ${safeRequest.versionTitle} 中国 日本 欧美 玩家 观点 差异`, { runId: runSeed, roles: ['player', 'context'], limit: 10 }) : []
  if (ragEnabled) {
    emit('sentiment', 'sentiment', 'rag', `情绪 Agent 从本地 RAG 取回 ${sentimentRag.length} 个相关片段`, 12, [], { ragHits: sentimentRag.length, ragDocuments: ragStats.documents, ragChunks: ragStats.chunks })
    emit('regional', 'regional', 'rag', `地区 Agent 从本地 RAG 取回 ${regionalRag.length} 个相关片段`, 12, [], { ragHits: regionalRag.length, ragDocuments: ragStats.documents, ragChunks: ragStats.chunks })
  }
  const [sentiment, regional] = await Promise.all([
    requestAgentJson({
      config,
      apiKey,
      fetchImpl,
      role: '玩家情绪分析 Agent',
      instruction: '严格返回形如 {"summary":"...","analyses":[{"evidenceId":"输入 id","sentiment":"positive|neutral|negative","topics":["原因主题"],"confidence":0.0,"excerptZh":"忠实中文释义"}]}。analyses 必须逐条覆盖输入中的每一个 id，不多不少。',
      payload: { task: safeRequest, evidence: modelEvidence, ragContext: ragContextForModel(sentimentRag) },
    }),
    requestAgentJson({
      config,
      apiKey,
      fetchImpl,
      role: '地区差异分析 Agent',
      instruction: '返回 regions 数组，包含 CN、JP、WEST；只能比较输入证据中明确出现的主题。没有证据的地区必须明确写证据不足，不得补充常识或假设。该输出仅用于执行日志，最终地区计数由程序从证据确定性派生。',
      payload: { task: safeRequest, evidence: modelEvidence, ragContext: ragContextForModel(regionalRag) },
    }).then((result) => {
      emit('regional', 'regional', 'handoff', '地区关注差异与证据缺口已完成', 100, evidence.map((item) => item.id))
      return result
    }),
  ])

  const analyzedEvidence = applySentimentAnalysis(evidence, sentiment)
  assertVerifiedEvidence(analyzedEvidence)
  emit('sentiment', 'sentiment', 'handoff', '情绪分类、原因主题与中文释义已完成', 100, analyzedEvidence.map((item) => item.id), { evidenceRecords: analyzedEvidence })
  emit('strategy', 'strategy', 'status', '策略 Agent 已收到全部真实证据与上游结论', 16)
  const derivedMetrics = derivePercentages(analyzedEvidence)
  const strategyRag = ragEnabled ? ragStore.retrieve(`${safeRequest.gameName} ${safeRequest.versionTitle} 风险 争议 下一版本 建议`, { runId: runSeed, roles: ['player', 'context'], limit: 12 }) : []
  if (ragEnabled) emit('strategy', 'strategy', 'rag', `策略 Agent 从本地 RAG 取回 ${strategyRag.length} 个相关片段`, 20, [], { ragHits: strategyRag.length, ragDocuments: ragStats.documents, ragChunks: ragStats.chunks })
  const strategy = await requestAgentJson({
    config,
    apiKey,
    fetchImpl,
    role: '策略建议 Agent',
    instruction: '返回 summary、riskLevel、controversies、recommendations。每条争议含 title、description、severity、region、evidenceIds、propagation；每条建议含 priority、title、action、rationale、region、evidenceIds。所有结论必须引用输入中存在的证据 id；描述不得与 derivedMetrics 的确定性统计矛盾。证据不足以支持争议、传播路径或建议时，相应数组必须为空，不得为了完整格式而补造结论。',
    payload: { task: safeRequest, derivedMetrics, sentimentSummary: sentiment.summary, regional, evidence: evidenceForModel(analyzedEvidence), ragContext: ragContextForModel(strategyRag) },
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
    researchCoverage: {
      targetSites: minimumSites,
      targetEvidence: minimumEvidence,
      sitesAttempted: coverage.sitesAttempted,
      evidenceCollected: evidence.length,
      attempts: coverage.attempts.length,
      providers: [...new Set(coverage.attempts.map((attempt) => attempt.provider))],
      targetReached,
      wikiDocuments: contextDocuments.length,
      browserPagesObserved: browserDocuments.length,
      ragDocuments: ragStats.documents,
      ragChunks: ragStats.chunks,
    },
  }
}

export const LIVE_SEARCH_BASE_URL = SEARCH_BASE_URL
