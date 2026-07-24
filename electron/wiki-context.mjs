const WIKIPEDIA_SOURCES = Object.freeze([
  { id: 'wikipedia-zh', name: 'Wikipedia', apiUrl: 'https://zh.wikipedia.org/w/api.php', language: 'zh-CN' },
  { id: 'wikipedia-en', name: 'Wikipedia', apiUrl: 'https://en.wikipedia.org/w/api.php', language: 'en-US' },
])

const GAME_WIKIS = Object.freeze({
  '原神': { id: 'genshin-wiki', name: 'Genshin Impact Wiki', apiUrl: 'https://genshin-impact.fandom.com/api.php', language: 'en-US' },
  '崩坏：星穹铁道': { id: 'hsr-wiki', name: 'Honkai: Star Rail Wiki', apiUrl: 'https://honkai-star-rail.fandom.com/api.php', language: 'en-US' },
  '崩坏:星穹铁道': { id: 'hsr-wiki', name: 'Honkai: Star Rail Wiki', apiUrl: 'https://honkai-star-rail.fandom.com/api.php', language: 'en-US' },
  '绝区零': { id: 'zzz-wiki', name: 'Zenless Zone Zero Wiki', apiUrl: 'https://zenless-zone-zero.fandom.com/api.php', language: 'en-US' },
})

function clean(value, limit = 80_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function stableHash(value) {
  let hash = 2166136261
  for (const character of String(value ?? '')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function getWikiSources(gameName) {
  const gameWiki = GAME_WIKIS[clean(gameName, 120)]
  return gameWiki ? [...WIKIPEDIA_SOURCES, gameWiki] : [...WIKIPEDIA_SOURCES]
}

function buildMediaWikiUrl(source, request) {
  const url = new URL(source.apiUrl)
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${clean(request.gameName, 120)} ${clean(request.versionLabel, 80)} ${clean(request.versionTitle, 180)}`,
    gsrnamespace: '0',
    gsrlimit: '4',
    prop: 'extracts|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    exsectionformat: 'plain',
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString()
  return url.href
}

function parsePages(payload, source, retrievedAt) {
  const pages = payload?.query?.pages
  const values = Array.isArray(pages) ? pages : pages && typeof pages === 'object' ? Object.values(pages) : []
  return values.map((page) => {
    const url = clean(page?.fullurl, 2_000)
    const text = clean(page?.extract)
    const title = clean(page?.title, 500)
    if (!url.startsWith('https://') || !text || !title) return null
    return {
      id: `wiki-${source.id}-${clean(page?.pageid, 60) || stableHash(url)}`,
      role: 'context',
      source: source.name,
      region: 'GLOBAL',
      language: source.language,
      title,
      url,
      text,
      retrievedAt,
    }
  }).filter(Boolean)
}

export async function collectWikiContext({ request, fetchImpl = fetch, now = Date.now, onSource = () => {} }) {
  const retrievedAt = new Date(now()).toISOString()
  const results = await Promise.allSettled(getWikiSources(request?.gameName).map(async (source) => {
    const response = await fetchImpl(buildMediaWikiUrl(source, request), {
      headers: { Accept: 'application/json', 'User-Agent': 'ReHoYoResearch/1.0 (public game research)' },
    })
    if (!response?.ok) throw new Error(`${source.name} HTTP ${response?.status ?? 'unknown'}`)
    const documents = parsePages(await response.json(), source, retrievedAt)
    onSource({ source: source.name, ok: true, count: documents.length })
    return documents
  }))

  const documents = []
  const seenUrls = new Set()
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      onSource({ source: getWikiSources(request?.gameName)[index].name, ok: false, count: 0, error: clean(result.reason?.message || result.reason, 180) })
      return
    }
    for (const document of result.value) {
      if (!seenUrls.has(document.url)) {
        seenUrls.add(document.url)
        documents.push(document)
      }
    }
  })
  return documents
}
