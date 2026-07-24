import { searchOpenAIWeb } from './openai-web-search.mjs'

const DEFAULT_BIGMODEL_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1'
const DEFAULT_BIGMODEL_MODEL = 'glm-5.2'
const DEFAULT_OPENAI_MODEL = 'gpt-5.6'
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TEXT_LENGTH = 120_000

function clean(value, limit = 2_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function rawText(value, limit = MAX_TEXT_LENGTH) {
  return String(value ?? '').trim().slice(0, limit)
}

function endpointUrl(value, fallback) {
  const url = new URL(String(value || fallback).trim().replace(/\/+$/, ''))
  if (url.protocol !== 'https:') throw new Error('Research provider endpoint must use HTTPS.')
  return url.href.replace(/\/+$/, '')
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:') return ''
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

function combineSignal(signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function redact(value, secrets = []) {
  let result = clean(value, 500)
  for (const secret of secrets) {
    const normalized = String(secret || '').trim()
    if (normalized) result = result.split(normalized).join('[REDACTED]')
  }
  return result.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function textFromHtml(value) {
  return clean(decodeEntities(String(value ?? '').replace(/<[^>]+>/g, ' ')), 500)
}

function candidateId(provider, index) {
  return `${provider}-${String(index + 1).padStart(3, '0')}`
}

function dedupeCandidates(candidates) {
  const unique = new Map()
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const url = httpsUrl(candidate?.url)
    if (!url || unique.has(url)) continue
    const provider = clean(candidate?.provider, 80) || 'webfetch'
    unique.set(url, {
      id: clean(candidate?.id, 160) || candidateId(provider, unique.size),
      url,
      title: clean(candidate?.title, 500) || new URL(url).hostname,
      source: clean(candidate?.source, 160) || new URL(url).hostname.replace(/^www\./, ''),
      provider,
      ...(candidate?.discoveryKind ? { discoveryKind: clean(candidate.discoveryKind, 80) } : {}),
    })
  }
  return [...unique.values()]
}

export class ResearchProviderError extends Error {
  constructor(provider, status, message, secrets = []) {
    super(redact(message || `${provider} request failed with HTTP ${status || 0}.`, secrets))
    this.name = status === 401 || status === 403 ? 'ProviderAuthenticationError' : 'ResearchProviderError'
    this.provider = provider
    this.status = Number(status || 0)
    this.authRequired = this.status === 401 || this.status === 403
    this.retryable = this.status === 429 || this.status >= 500 || this.status === 0
  }
}

async function errorMessage(response) {
  const text = await response.text()
  try {
    const payload = JSON.parse(text)
    return clean(payload?.error?.message || payload?.message || `HTTP ${response.status}`, 500)
  } catch {
    return clean(text || `HTTP ${response.status}`, 500)
  }
}

async function assertResponse(response, provider, apiKey = '') {
  if (response.ok) return response
  throw new ResearchProviderError(provider, response.status, await errorMessage(response), [apiKey])
}

function normalizeThrown(error, provider, apiKey = '') {
  if (error instanceof ResearchProviderError) return error
  const status = Number(error?.status || 0)
  return new ResearchProviderError(provider, status, error instanceof Error ? error.message : error, [apiKey])
}

export function createOpenAIWebSearchProvider({
  endpoint = DEFAULT_OPENAI_ENDPOINT,
  apiKey,
  model = DEFAULT_OPENAI_MODEL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return async function openAIWebSearchProvider({ action, region, request, signal } = {}) {
    const query = clean(action?.query, 1_000)
    if (!query) throw new Error('OpenAI Web Search requires a localized search query.')
    const input = [
      query,
      action?.purpose ? `Research purpose: ${clean(action.purpose, 500)}` : '',
      region ? `Target region: ${clean(region, 30)}` : '',
      request?.gameName ? `Game: ${clean(request.gameName, 200)}` : '',
      request?.versionLabel ? `Version: ${clean(request.versionLabel, 100)} ${clean(request.versionTitle, 300)}` : '',
      'Return public source URLs containing original player-authored discussion. Search output text is discovery metadata only.',
    ].filter(Boolean).join('\n')
    try {
      const result = await searchOpenAIWeb({ endpoint, apiKey, model, input, fetchImpl, signal, timeoutMs })
      return { candidates: dedupeCandidates(result.candidates) }
    } catch (error) {
      throw normalizeThrown(error, 'openai', apiKey)
    }
  }
}

export function parseBigModelSearchResponse(payload) {
  const results = Array.isArray(payload?.search_result)
    ? payload.search_result
    : Array.isArray(payload?.data?.search_result)
      ? payload.data.search_result
      : []
  return dedupeCandidates(results.map((item, index) => ({
    id: candidateId('bigmodel-search', index),
    url: item?.link || item?.url,
    title: item?.title,
    source: item?.media || item?.source,
    provider: 'bigmodel_search',
  })))
}

export function createBigModelSearchProvider({
  endpoint = DEFAULT_BIGMODEL_ENDPOINT,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 45_000,
} = {}) {
  return async function bigModelSearchProvider({ action, signal } = {}) {
    const credential = String(apiKey || '').trim()
    if (!credential) throw new ResearchProviderError('bigmodel', 401, 'BigModel API key is missing.')
    const query = clean(action?.query, 1_000)
    if (!query) throw new Error('BigModel Web Search requires a localized search query.')
    try {
      const response = await fetchImpl(`${endpointUrl(endpoint, DEFAULT_BIGMODEL_ENDPOINT)}/web_search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search_engine: 'search_std',
          search_query: query,
          search_recency_filter: 'noLimit',
          count: 20,
          content_size: 'high',
        }),
        signal: combineSignal(signal, timeoutMs),
      })
      await assertResponse(response, 'bigmodel', credential)
      return { candidates: parseBigModelSearchResponse(await response.json()) }
    } catch (error) {
      throw normalizeThrown(error, 'bigmodel', credential)
    }
  }
}

export function parseBraveCandidates(html) {
  const source = String(html ?? '')
  const starts = [...source.matchAll(/<div\s+class=["'][^"']*\bsnippet\b[^"']*["'][^>]*(?:data-type=["']web["'])?[^>]*>/gi)]
  const candidates = starts.map((match, index) => {
    const chunk = source.slice(match.index, starts[index + 1]?.index ?? source.length)
    const href = decodeEntities(chunk.match(/<a\s+[^>]*href=["'](https:\/\/[^"']+)["']/i)?.[1] || '')
    const url = httpsUrl(href)
    const title = textFromHtml(
      chunk.match(/<(?:div|span|h\d)\s+class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|h\d)>/i)?.[1]
      || chunk.match(/<a\s+[^>]*href=["']https:\/\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || '',
    )
    return {
      id: candidateId('webfetch-brave', index),
      url,
      title,
      source: url ? new URL(url).hostname.replace(/^www\./, '') : '',
      provider: 'webfetch',
      discoveryKind: 'brave_html',
    }
  })
  return dedupeCandidates(candidates)
}

export function parseRedditRssCandidates(xml) {
  const source = String(xml ?? '')
  const entries = [...source.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)]
  return dedupeCandidates(entries.map((match, index) => {
    const chunk = match[1]
    const url = decodeEntities(
      chunk.match(/<link\s+[^>]*href=["'](https:\/\/[^"']+)["'][^>]*\/?\s*>/i)?.[1]
      || chunk.match(/<link(?:\s[^>]*)?>(https:\/\/[^<]+)<\/link>/i)?.[1]
      || '',
    )
    return {
      id: candidateId('webfetch-reddit', index),
      url,
      title: textFromHtml(chunk.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1] || ''),
      source: 'Reddit',
      provider: 'webfetch',
      discoveryKind: 'reddit_rss',
    }
  }))
}

export function parseNiconicoCandidates(payload) {
  const records = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : []
  return dedupeCandidates(records.map((item, index) => {
    const id = clean(item?.contentId || item?.id, 120)
    return {
      id: candidateId('webfetch-niconico', index),
      url: id ? `https://www.nicovideo.jp/watch/${encodeURIComponent(id)}` : '',
      title: item?.title,
      source: 'Niconico',
      provider: 'webfetch',
      discoveryKind: 'niconico_api',
    }
  }))
}

async function fetchDiscoveryResource({ url, headers, fetchImpl, signal, timeoutMs, parser }) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal: combineSignal(signal, timeoutMs),
  })
  await assertResponse(response, 'webfetch')
  return parser(response)
}

function redditSearchUrl(query) {
  const url = new URL('https://www.reddit.com/search.rss')
  url.searchParams.set('q', query)
  url.searchParams.set('sort', 'relevance')
  url.searchParams.set('t', 'all')
  return url.href
}

function niconicoSearchUrl(query) {
  const url = new URL('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search')
  url.searchParams.set('q', query)
  url.searchParams.set('targets', 'title,description,tags')
  url.searchParams.set('fields', 'contentId,title,startTime,commentCounter')
  url.searchParams.set('_sort', '-commentCounter')
  url.searchParams.set('_limit', '30')
  url.searchParams.set('_context', 'rehoyo_public_research')
  return url.href
}

export function createWebFetchDiscoveryProvider({ fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
  return async function webFetchDiscoveryProvider({ action, region, signal } = {}) {
    const query = clean(action?.query, 1_000)
    if (!query) throw new Error('WebFetch discovery requires a localized search query.')
    const braveUrl = new URL('https://search.brave.com/search')
    braveUrl.searchParams.set('q', query)
    braveUrl.searchParams.set('source', 'web')
    const requests = [fetchDiscoveryResource({
      url: braveUrl.href,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': `${clean(action?.language, 30) || 'en'},en;q=0.7`,
        'User-Agent': 'Mozilla/5.0 ReHoYo/0.1 public-research-client',
      },
      fetchImpl,
      signal,
      timeoutMs,
      parser: async (response) => parseBraveCandidates(await response.text()),
    })]

    if (region === 'WEST') {
      requests.push(fetchDiscoveryResource({
        url: redditSearchUrl(query),
        headers: {
          Accept: 'application/atom+xml',
          'User-Agent': 'windows:com.rehoyo.player-intelligence:v0.1 (public research client)',
        },
        fetchImpl,
        signal,
        timeoutMs,
        parser: async (response) => parseRedditRssCandidates(await response.text()),
      }))
    } else if (region === 'JP') {
      requests.push(fetchDiscoveryResource({
        url: niconicoSearchUrl(query),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ReHoYo/0.1 public-research-client',
        },
        fetchImpl,
        signal,
        timeoutMs,
        parser: async (response) => parseNiconicoCandidates(await response.json()),
      }))
    }

    const outcomes = await Promise.allSettled(requests)
    const candidates = outcomes
      .filter((outcome) => outcome.status === 'fulfilled')
      .flatMap((outcome) => outcome.value)
    if (!candidates.length && outcomes.every((outcome) => outcome.status === 'rejected')) {
      throw outcomes.find((outcome) => outcome.status === 'rejected').reason
    }
    return { candidates: dedupeCandidates(candidates) }
  }
}

export async function fetchPublicSupplement({
  url,
  fetchImpl = fetch,
  signal,
  timeoutMs = 30_000,
  maxLength = MAX_TEXT_LENGTH,
} = {}) {
  const exactUrl = httpsUrl(url)
  if (!exactUrl) throw new Error('Public supplement URL must use HTTPS.')
  try {
    const response = await fetchImpl(exactUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json,application/atom+xml,application/rss+xml,text/plain',
        'User-Agent': 'ReHoYo/0.1 public-research-client',
      },
      signal: combineSignal(signal, timeoutMs),
    })
    await assertResponse(response, 'webfetch')
    return {
      url: exactUrl,
      contentType: clean(response.headers.get('content-type'), 160),
      text: rawText(await response.text(), Math.max(1_000, Number(maxLength) || MAX_TEXT_LENGTH)),
    }
  } catch (error) {
    throw normalizeThrown(error, 'webfetch')
  }
}

function parseJsonObject(value, label) {
  const source = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    const parsed = JSON.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be an object.`)
    return parsed
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${clean(error instanceof Error ? error.message : error, 200)}`)
  }
}

async function postBigModelJson({ endpoint, apiKey, body, fetchImpl, signal, timeoutMs }) {
  const credential = String(apiKey || '').trim()
  if (!credential) throw new ResearchProviderError('bigmodel', 401, 'BigModel API key is missing.')
  try {
    const response = await fetchImpl(`${endpointUrl(endpoint, DEFAULT_BIGMODEL_ENDPOINT)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: combineSignal(signal, timeoutMs),
    })
    await assertResponse(response, 'bigmodel', credential)
    return await response.json()
  } catch (error) {
    throw normalizeThrown(error, 'bigmodel', credential)
  }
}

function normalizedExpression(value) {
  const original = clean(value?.original, 2_000)
  if (!original) return null
  return {
    original,
    translatedZh: clean(value?.translatedZh, 2_000) || original,
    author: clean(value?.author, 160),
    sentiment: ['positive', 'neutral', 'negative'].includes(value?.sentiment) ? value.sentiment : 'neutral',
    topics: Array.isArray(value?.topics) ? value.topics.map((topic) => clean(topic, 80)).filter(Boolean).slice(0, 8) : [],
    confidence: Math.max(0, Math.min(1, Number(value?.confidence) || 0)),
    publishedLabel: clean(value?.publishedLabel, 100),
  }
}

export async function judgePageWithBigModel({
  endpoint = DEFAULT_BIGMODEL_ENDPOINT,
  apiKey,
  model = DEFAULT_BIGMODEL_MODEL,
  fetchImpl = fetch,
  region,
  request,
  candidate,
  page,
  comments = [],
  supplement,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const browserText = rawText(page?.text || page?.bodyText || page?.extractedText, MAX_TEXT_LENGTH)
  const browserComments = (Array.isArray(comments) ? comments : [])
    .map((comment) => rawText(typeof comment === 'string' ? comment : comment?.text, 4_000))
    .filter(Boolean)
    .slice(0, 100)
  if (!browserText && !browserComments.length) {
    throw new Error('BigModel page judgment requires browser-observed text or comments.')
  }

  const payload = await postBigModelJson({
    endpoint,
    apiKey,
    fetchImpl,
    signal,
    timeoutMs,
    body: {
      model: clean(model, 120) || DEFAULT_BIGMODEL_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是 ReHoYo 的真实网页证据审核 Agent。只能判断用户消息内由 Playwright 实际观察到的正文、可见评论及同 URL 补充正文。不得把搜索摘要、模型常识或 Wiki 背景写成玩家观点。expressions.original 必须逐字复制输入语料中的玩家原始表达。只返回 JSON。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            region: clean(region, 30),
            researchRequest: request ?? {},
            candidate: {
              url: httpsUrl(candidate?.url),
              title: clean(candidate?.title, 500),
            },
            browserObservation: {
              text: browserText,
              comments: browserComments,
            },
            supplement: rawText(supplement, MAX_TEXT_LENGTH),
            outputSchema: {
              relevant: 'boolean',
              containsPlayerExpression: 'boolean',
              needsSupplement: 'boolean',
              reason: 'string',
              expressions: [{ original: 'verbatim string', translatedZh: 'string', author: 'string', sentiment: 'positive|neutral|negative', topics: ['string'], confidence: '0..1' }],
            },
          }),
        },
      ],
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    },
  })

  const parsed = parseJsonObject(payload?.choices?.[0]?.message?.content, 'BigModel page judgment')
  return {
    relevant: parsed.relevant === true,
    containsPlayerExpression: parsed.containsPlayerExpression === true,
    needsSupplement: parsed.needsSupplement === true,
    reason: clean(parsed.reason, 1_000),
    expressions: (Array.isArray(parsed.expressions) ? parsed.expressions : []).map(normalizedExpression).filter(Boolean),
  }
}

export function createGlmResearchPlanner({
  endpoint = DEFAULT_BIGMODEL_ENDPOINT,
  apiKey,
  model = DEFAULT_BIGMODEL_MODEL,
  toolSchemas,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!Array.isArray(toolSchemas) || !toolSchemas.length) throw new Error('GLM research planner requires at least one tool schema.')
  const tools = JSON.parse(JSON.stringify(toolSchemas))
  return {
    async nextAction(context = {}) {
      const payload = await postBigModelJson({
        endpoint,
        apiKey,
        fetchImpl,
        signal: context.signal,
        timeoutMs,
        body: {
          model: clean(model, 120) || DEFAULT_BIGMODEL_MODEL,
          messages: [
            {
              role: 'system',
              content: '你是 ReHoYo 动态研究调度 Agent。根据当前地区配额、已尝试查询、候选页和浏览器状态选择唯一一个工具动作。不得在 message.content 输出自由 JSON；必须调用一个已注册函数。不得把搜索摘要当作玩家证据。',
            },
            { role: 'user', content: JSON.stringify(context) },
          ],
          tools,
          tool_choice: 'required',
          thinking: { type: 'disabled' },
        },
      })
      const message = payload?.choices?.[0]?.message
      if (!message || !Array.isArray(message.tool_calls) || !message.tool_calls.length) {
        throw new Error('GLM research planner did not return a function tool call.')
      }
      return message
    },
  }
}

export const RESEARCH_PROVIDER_DEFAULTS = Object.freeze({
  bigModelEndpoint: DEFAULT_BIGMODEL_ENDPOINT,
  bigModelModel: DEFAULT_BIGMODEL_MODEL,
  openAIEndpoint: DEFAULT_OPENAI_ENDPOINT,
  openAIModel: DEFAULT_OPENAI_MODEL,
})
