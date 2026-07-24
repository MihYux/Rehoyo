import { jsonrepair } from 'jsonrepair'

const ACTION_TYPES = new Set(['search_web', 'open_page', 'scroll_page', 'extract_comments', 'inspect_source', 'finish_region'])

function clean(value, limit = 2_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function publicHttps(value) {
  const url = new URL(clean(value))
  if (url.protocol !== 'https:') throw new Error('Research browser actions require an HTTPS URL.')
  if (url.username || url.password) throw new Error('Research URLs cannot include credentials.')
  return url.href
}

export function parseResearchAction(value) {
  let action = value
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    try {
      action = JSON.parse(normalized)
    } catch {
      action = JSON.parse(jsonrepair(normalized))
    }
  }
  if (!action || typeof action !== 'object' || !ACTION_TYPES.has(action.type)) throw new Error('Agent returned an unsupported research action.')

  if (action.type === 'search_web') {
    if (!['brave', 'bigmodel'].includes(action.provider)) throw new Error('search_web requires brave or bigmodel.')
    const query = clean(action.query, 500)
    if (query.length < 4) throw new Error('search_web requires a meaningful query.')
    return { type: action.type, provider: action.provider, query, language: clean(action.language, 30) || 'en-US' }
  }
  if (action.type === 'open_page' || action.type === 'inspect_source') {
    return { type: action.type, url: publicHttps(action.url), reason: clean(action.reason, 500) }
  }
  if (action.type === 'scroll_page') {
    const pageId = clean(action.pageId, 160)
    if (!pageId) throw new Error('scroll_page requires pageId.')
    return { type: action.type, pageId, direction: action.direction === 'up' ? 'up' : 'down', amount: Math.max(200, Math.min(4_000, Math.floor(Number(action.amount) || 900))) }
  }
  if (action.type === 'extract_comments') {
    const pageId = clean(action.pageId, 160)
    if (!pageId) throw new Error('extract_comments requires pageId.')
    return { type: action.type, pageId, selectors: Array.isArray(action.selectors) ? action.selectors.map((item) => clean(item, 300)).filter(Boolean).slice(0, 8) : [] }
  }
  return { type: action.type, reason: clean(action.reason, 500) }
}

export async function executeResearchAction(action, tools) {
  const method = {
    search_web: 'searchWeb',
    open_page: 'openPage',
    scroll_page: 'scrollPage',
    extract_comments: 'extractComments',
    inspect_source: 'inspectSource',
  }[action.type]
  if (!method) return { evidence: [], inspected: [] }
  if (typeof tools?.[method] !== 'function') throw new Error(`Research tool ${method} is unavailable.`)
  const result = await tools[method](action)
  return {
    evidence: Array.isArray(result?.evidence) ? result.evidence : [],
    inspected: Array.isArray(result?.inspected) ? result.inspected : [],
    pages: Array.isArray(result?.pages) ? result.pages : [],
    message: clean(result?.message, 500),
  }
}
