const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-5.6'

function normalizeEndpoint(value) {
  const endpoint = String(value || DEFAULT_ENDPOINT).trim().replace(/\/+$/, '')
  const parsed = new URL(endpoint)
  if (parsed.protocol !== 'https:') throw new Error('OpenAI search endpoint must use HTTPS.')
  return parsed.href.replace(/\/+$/, '')
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    if (parsed.protocol !== 'https:') return ''
    parsed.hash = ''
    return parsed.href
  } catch {
    return ''
  }
}

export class ProviderAuthenticationError extends Error {
  constructor(provider, status, message) {
    super(message || `${provider} authentication failed.`)
    this.name = 'ProviderAuthenticationError'
    this.provider = provider
    this.status = status
  }
}

export function createOpenAIWebSearchBody({ model = DEFAULT_MODEL, input }) {
  const prompt = String(input || '').trim()
  if (!prompt) throw new Error('OpenAI Web Search requires a non-empty input.')
  return {
    model: String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    store: false,
    tools: [{
      type: 'web_search',
      external_web_access: true,
      search_context_size: 'high',
    }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    input: prompt,
  }
}

function collectAnnotations(content, candidates) {
  for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
    if (annotation?.type !== 'url_citation') continue
    candidates.push({
      url: annotation.url,
      title: annotation.title,
      discoveryKind: 'url_citation',
    })
  }
}

export function parseOpenAIWebSearchResponse(payload) {
  const candidates = []
  const textParts = []
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    if (output?.type === 'web_search_call') {
      for (const source of Array.isArray(output?.action?.sources) ? output.action.sources : []) {
        candidates.push({
          url: source?.url,
          title: source?.title,
          discoveryKind: 'web_search_source',
        })
      }
    }
    if (output?.type === 'message') {
      for (const content of Array.isArray(output?.content) ? output.content : []) {
        if (typeof content?.text === 'string' && content.text.trim()) textParts.push(content.text.trim())
        collectAnnotations(content, candidates)
      }
    }
  }

  const unique = new Map()
  for (const candidate of candidates) {
    const url = safeHttpsUrl(candidate.url)
    if (!url || unique.has(url)) continue
    unique.set(url, {
      id: `openai-${unique.size + 1}`,
      url,
      title: String(candidate.title || new URL(url).hostname).trim().slice(0, 300),
      discoveryKind: candidate.discoveryKind,
      provider: 'openai_search',
    })
  }

  return {
    requestId: String(payload?.id || ''),
    model: String(payload?.model || DEFAULT_MODEL),
    candidates: [...unique.values()],
    modelText: textParts.join('\n\n'),
  }
}

async function readError(response) {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text)
    return String(parsed?.error?.message || `HTTP ${response.status}`).slice(0, 500)
  } catch {
    return String(text || `HTTP ${response.status}`).slice(0, 500)
  }
}

export async function searchOpenAIWeb({
  endpoint = DEFAULT_ENDPOINT,
  apiKey,
  model = DEFAULT_MODEL,
  input,
  fetchImpl = fetch,
  signal,
  timeoutMs = 60_000,
}) {
  const credential = String(apiKey || '').trim()
  if (!credential) throw new ProviderAuthenticationError('openai', 401, 'OpenAI API key is missing.')
  const timeoutSignal = AbortSignal.timeout(Math.max(1_000, Number(timeoutMs) || 60_000))
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetchImpl(`${normalizeEndpoint(endpoint)}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createOpenAIWebSearchBody({ model, input })),
    signal: requestSignal,
  })

  if (!response.ok) {
    const message = await readError(response)
    if (response.status === 401 || response.status === 403) {
      throw new ProviderAuthenticationError('openai', response.status, message)
    }
    const error = new Error(`OpenAI Web Search failed: ${message}`)
    error.status = response.status
    throw error
  }

  return parseOpenAIWebSearchResponse(await response.json())
}

export const OPENAI_SEARCH_DEFAULTS = Object.freeze({
  endpoint: DEFAULT_ENDPOINT,
  model: DEFAULT_MODEL,
})
