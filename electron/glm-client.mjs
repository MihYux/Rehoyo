import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const SEARCH_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-5.2'

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}

function getLaunchArgument(argv, name) {
  const prefix = `--${name}=`
  const match = argv.find((value) => String(value).startsWith(prefix))
  return match ? String(match).slice(prefix.length) : ''
}

export function readGlmLaunchEnvironment(argv = process.argv, readText = (filePath) => readFileSync(filePath, 'utf8')) {
  const configPath = getLaunchArgument(argv, 'rehoyo-glm-config')
  if (!configPath) return {}

  const parsed = JSON.parse(readText(configPath))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid GLM launch configuration.')
  }

  return {
    REHOYO_GLM_API_KEY_FILE: String(parsed.keyFile || '').trim(),
    REHOYO_GLM_BASE_URL: String(parsed.baseUrl || '').trim(),
    REHOYO_GLM_MODEL: String(parsed.model || '').trim(),
  }
}

export function createGlmRuntimeConfig(
  environment = process.env,
  fileExists = existsSync,
  argv = process.argv,
) {
  const baseUrl = normalizeBaseUrl(
    environment.REHOYO_GLM_BASE_URL || getLaunchArgument(argv, 'rehoyo-glm-base-url'),
  )
  if (baseUrl !== DEFAULT_BASE_URL) {
    throw new Error('Unsupported GLM endpoint. ReHoYo only permits the configured BigModel Coding endpoint.')
  }

  const keyFile = String(
    environment.REHOYO_GLM_API_KEY_FILE || getLaunchArgument(argv, 'rehoyo-glm-key-file'),
  ).trim()
  const model = String(
    environment.REHOYO_GLM_MODEL || getLaunchArgument(argv, 'rehoyo-glm-model') || DEFAULT_MODEL,
  ).trim() || DEFAULT_MODEL

  return Object.freeze({
    baseUrl,
    searchBaseUrl: SEARCH_BASE_URL,
    model,
    keyFile,
    configured: Boolean(keyFile && fileExists(keyFile)),
  })
}

export function getPublicGlmStatus(config) {
  return Object.freeze({
    configured: config.configured,
    endpoint: new URL(config.baseUrl).hostname,
    model: config.model,
  })
}

function cleanString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export function sanitizeGlmAdvisorRequest(value) {
  const input = value && typeof value === 'object' ? value : {}
  const question = cleanString(input.question, 800)
  if (!question) throw new Error('A non-empty advisor question is required.')

  const evidence = Array.isArray(input.evidence)
    ? input.evidence.slice(0, 12).map((item) => ({
      id: cleanString(item?.id, 100),
      source: cleanString(item?.source, 100),
      region: cleanString(item?.region, 24),
      excerptZh: cleanString(item?.excerptZh, 1200),
      sentiment: cleanString(item?.sentiment, 24),
      topics: Array.isArray(item?.topics)
        ? item.topics.slice(0, 8).map((topic) => cleanString(topic, 80)).filter(Boolean)
        : [],
      title: cleanString(item?.title, 300),
      url: /^https:\/\//.test(String(item?.url || '')) ? cleanString(item.url, 1_000) : '',
    })).filter((item) => item.id && item.excerptZh && item.url)
    : []

  if (!evidence.length) throw new Error('Advisor requests require at least one verified HTTPS evidence record.')

  return {
    question,
    localAnswer: cleanString(input.localAnswer, 16_000),
    evidence,
    dataMode: 'live',
  }
}

function buildMessages(request) {
  const groundingRule = '输入证据来自本次任务实时检索到的公开网页或 RSS，带有可核验 URL。只能依据这些证据回答，不得声称已读取 URL 之外的完整评论区，也不得补造玩家数量或观点。'
  return [
    {
      role: 'system',
      content: [
        '你是 ReHoYo Electron 应用中的游戏版本决策顾问。',
        groundingRule,
        '使用简洁中文给出结论，并在相关判断后保留方括号证据编号，例如 [gi-west-02]。',
        '证据不足时必须明确说明，不得补造事实。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: request.question,
        localEvidenceSummary: request.localAnswer,
        evidence: request.evidence,
      }, null, 2),
    },
  ]
}

function createAdvisorRequestBody(config, safeRequest, stream) {
  return JSON.stringify({
    model: config.model,
    messages: buildMessages(safeRequest),
    thinking: { type: 'disabled' },
    temperature: 0.2,
    max_tokens: 6000,
    stream,
  })
}

async function getResponseError(response) {
  const body = await response.text()
  try {
    const payload = JSON.parse(body)
    return String(payload?.error?.message || `HTTP ${response.status}`).slice(0, 240)
  } catch {
    return String(body || `HTTP ${response.status}`).slice(0, 240)
  }
}

async function consumeSse(body, onPayload, signal) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reachedDone = false

  const consumeFrame = async (frame) => {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') {
        reachedDone = true
        return
      }
      if (payload) await onPayload(payload)
    }
  }

  try {
    while (!reachedDone) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        await consumeFrame(frame)
        if (reachedDone) break
      }
      if (done) break
    }

    if (!reachedDone && buffer.trim()) await consumeFrame(buffer)
  } finally {
    reader.releaseLock()
  }
}

export async function streamGlmAdvisor({
  config,
  request,
  fetchImpl = fetch,
  getApiKey,
  readKeyFile = (keyFile) => readFile(keyFile, 'utf8'),
  signal,
  onEvent = () => {},
}) {
  if (!config.configured) throw new Error('GLM advisor is not configured.')

  const safeRequest = sanitizeGlmAdvisorRequest(request)
  const apiKey = String(getApiKey ? await getApiKey() : await readKeyFile(config.keyFile)).trim()
  if (!apiKey) throw new Error('GLM API key is empty.')

  const timeoutSignal = AbortSignal.timeout(60_000)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: createAdvisorRequestBody(config, safeRequest, true),
    signal: requestSignal,
  })

  if (!response.ok) {
    throw new Error(`GLM request failed: ${await getResponseError(response)}`)
  }
  if (!response.body) throw new Error('GLM returned an unreadable advisor stream.')

  let content = ''
  let model = config.model
  let requestId = ''
  await consumeSse(response.body, async (data) => {
    let payload
    try {
      payload = JSON.parse(data)
    } catch {
      throw new Error('Invalid SSE payload from GLM.')
    }

    if (payload?.id) requestId = String(payload.id)
    if (payload?.model) model = String(payload.model)
    const delta = payload?.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) {
      content += delta
      await onEvent({ type: 'delta', content: delta })
    }
  }, requestSignal)

  if (!content.trim()) throw new Error('GLM returned an empty advisor response.')
  return { content: content.trim(), model, requestId }
}

export async function requestGlmAdvisor({
  config,
  request,
  fetchImpl = fetch,
  getApiKey,
  readKeyFile = (keyFile) => readFile(keyFile, 'utf8'),
}) {
  if (!config.configured) throw new Error('GLM advisor is not configured.')

  const safeRequest = sanitizeGlmAdvisorRequest(request)
  const apiKey = String(getApiKey ? await getApiKey() : await readKeyFile(config.keyFile)).trim()
  if (!apiKey) throw new Error('GLM API key is empty.')

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: createAdvisorRequestBody(config, safeRequest, false),
    signal: AbortSignal.timeout(60_000),
  })

  const payload = await response.json()
  if (!response.ok) {
    const message = String(payload?.error?.message || `HTTP ${response.status}`).slice(0, 240)
    throw new Error(`GLM request failed: ${message}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('GLM returned an empty advisor response.')
  }

  return {
    content: content.trim(),
    model: String(payload.model || config.model),
    requestId: String(payload.id || ''),
  }
}
