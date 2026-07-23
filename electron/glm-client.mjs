import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
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
    })).filter((item) => item.id && item.excerptZh)
    : []

  return {
    question,
    localAnswer: cleanString(input.localAnswer, 4000),
    evidence,
  }
}

function buildMessages(request) {
  return [
    {
      role: 'system',
      content: [
        '你是 ReHoYo Electron 应用开发集成测试中的游戏版本决策顾问。',
        '仅依据用户提供的确定性演示数据快照回答，不得声称访问了实时社区或真实玩家数据。',
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

export async function requestGlmAdvisor({
  config,
  request,
  fetchImpl = fetch,
  readKeyFile = (keyFile) => readFile(keyFile, 'utf8'),
}) {
  if (!config.configured) throw new Error('GLM advisor is not configured.')

  const safeRequest = sanitizeGlmAdvisorRequest(request)
  const apiKey = String(await readKeyFile(config.keyFile)).trim()
  if (!apiKey) throw new Error('GLM API key file is empty.')

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildMessages(safeRequest),
      thinking: { type: 'disabled' },
      temperature: 0.2,
      max_tokens: 1200,
      stream: false,
    }),
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
