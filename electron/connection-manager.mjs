import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BIGMODEL_CODING_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'
export const BIGMODEL_SEARCH_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4'
export const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1'
export const DEFAULT_GLM_MODEL = 'glm-5.2'
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6'

const CONNECTION_FILE = 'rehoyo-connection.json'
const PROVIDERS = Object.freeze(['ai', 'search'])
const DEFINITIONS = Object.freeze({
  ai: Object.freeze({
    provider: 'bigmodel',
    endpoint: BIGMODEL_CODING_ENDPOINT,
    model: DEFAULT_GLM_MODEL,
    keyEnvironmentName: 'REHOYO_BIGMODEL_API_KEY',
    endpointEnvironmentName: 'REHOYO_BIGMODEL_ENDPOINT',
    label: 'BigModel',
  }),
  search: Object.freeze({
    provider: 'openai',
    endpoint: OPENAI_API_ENDPOINT,
    model: DEFAULT_OPENAI_MODEL,
    keyEnvironmentName: 'REHOYO_OPENAI_API_KEY',
    endpointEnvironmentName: 'REHOYO_OPENAI_ENDPOINT',
    label: 'OpenAI',
  }),
})

function connectionError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeEndpoint(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

function assertKnownProvider(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw connectionError('INVALID_PROVIDER', 'Connection provider must be "ai" or "search".')
  }
  return provider
}

function sanitizeProviderInput(provider, value) {
  const definition = DEFINITIONS[provider]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw connectionError('INVALID_INPUT', `Invalid ${definition.label} connection input.`)
  }
  if (Object.keys(value).some((key) => !['apiKey', 'endpoint'].includes(key))) {
    throw connectionError('INVALID_INPUT', 'Invalid connection input.')
  }

  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
  if (!apiKey || apiKey.length > 4096) {
    throw connectionError('INVALID_API_KEY', `Enter a valid ${definition.label} API key.`)
  }

  const endpoint = normalizeEndpoint(value.endpoint)
  if (endpoint !== definition.endpoint) {
    throw connectionError(
      'UNSUPPORTED_ENDPOINT',
      `ReHoYo only supports the official ${definition.label} endpoint.`,
    )
  }
  return { apiKey, endpoint }
}

export function sanitizeConnectionInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw connectionError('INVALID_INPUT', 'Invalid connection input.')
  }

  // Keep the previous renderer contract readable during an in-place v1 upgrade.
  if ('apiKey' in value || 'endpoint' in value) {
    if (Object.keys(value).some((key) => !['apiKey', 'endpoint'].includes(key))) {
      throw connectionError('INVALID_INPUT', 'Invalid connection input.')
    }
    return { ai: sanitizeProviderInput('ai', value) }
  }

  if (Object.keys(value).some((key) => !PROVIDERS.includes(key))) {
    throw connectionError('INVALID_INPUT', 'Invalid connection input.')
  }

  const sanitized = {}
  for (const provider of PROVIDERS) {
    if (provider in value) sanitized[provider] = sanitizeProviderInput(provider, value[provider])
  }
  if (!Object.keys(sanitized).length) {
    throw connectionError('INVALID_INPUT', 'At least one connection is required.')
  }
  return sanitized
}

function validateStoredProvider(value, provider) {
  const definition = DEFINITIONS[provider]
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    value.provider !== definition.provider ||
    normalizeEndpoint(value.endpoint) !== definition.endpoint ||
    value.model !== definition.model ||
    typeof value.encryptedApiKey !== 'string' || !value.encryptedApiKey
  ) {
    throw connectionError('INVALID_STORED_CONNECTION', `Stored ${definition.label} connection is invalid.`)
  }
  return {
    provider: definition.provider,
    endpoint: definition.endpoint,
    model: definition.model,
    encryptedApiKey: value.encryptedApiKey,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function validateStoredConnection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw connectionError('INVALID_STORED_CONNECTION', 'Stored connection is invalid.')
  }

  if (value.version === 1) {
    return {
      version: 1,
      connections: {
        ai: validateStoredProvider(value, 'ai'),
      },
    }
  }

  if (
    value.version !== 2 ||
    !value.connections || typeof value.connections !== 'object' || Array.isArray(value.connections) ||
    Object.keys(value.connections).some((key) => !PROVIDERS.includes(key))
  ) {
    throw connectionError('INVALID_STORED_CONNECTION', 'Stored connection is invalid.')
  }

  const connections = {}
  for (const provider of PROVIDERS) {
    if (provider in value.connections) {
      connections[provider] = validateStoredProvider(value.connections[provider], provider)
    }
  }
  if (!Object.keys(connections).length) {
    throw connectionError('INVALID_STORED_CONNECTION', 'Stored connection is empty.')
  }
  return { version: 2, connections }
}

export function createConnectionManager({
  userDataPath,
  safeStorage,
  environment = {},
  externalConfig,
  externalGetApiKey,
  now = Date.now,
}) {
  if (!userDataPath || typeof userDataPath !== 'string') {
    throw new Error('A userData path is required.')
  }

  const connectionPath = path.join(userDataPath, CONNECTION_FILE)
  const sources = { ai: 'none', search: 'none' }
  const encryptedRecords = { ai: null, search: null }
  const sessionApiKeys = { ai: '', search: '' }
  const environmentApiKeys = { ai: '', search: '' }
  const invalidatedEnvironment = new Set()

  function encryptionAvailable() {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.())
    } catch {
      return false
    }
  }

  async function quarantineInvalidStore() {
    try {
      await rename(connectionPath, `${connectionPath}.${now()}.invalid`)
    } catch {
      // The invalid file may already be missing or locked. It is ignored safely.
    }
  }

  function encryptedStorePayload() {
    const connections = {}
    for (const provider of PROVIDERS) {
      if (encryptedRecords[provider]) connections[provider] = encryptedRecords[provider]
    }
    return { version: 2, connections }
  }

  async function persistEncryptedStore() {
    const payload = encryptedStorePayload()
    if (!Object.keys(payload.connections).length) {
      await rm(connectionPath, { force: true })
      return
    }

    await mkdir(userDataPath, { recursive: true })
    const temporaryPath = `${connectionPath}.${process.pid}.${now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      await rename(temporaryPath, connectionPath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  function applyEnvironment(provider) {
    if (invalidatedEnvironment.has(provider)) return
    const definition = DEFINITIONS[provider]
    const apiKey = String(environment?.[definition.keyEnvironmentName] || '').trim()
    const endpointValue = String(environment?.[definition.endpointEnvironmentName] || definition.endpoint)
    if (!apiKey || apiKey.length > 4096 || normalizeEndpoint(endpointValue) !== definition.endpoint) return
    environmentApiKeys[provider] = apiKey
    sources[provider] = 'environment'
  }

  function providerStatus(provider) {
    const definition = DEFINITIONS[provider]
    const source = sources[provider]
    const configured = source !== 'none'
    return Object.freeze({
      configured,
      provider: definition.provider,
      endpoint: definition.endpoint,
      model: definition.model,
      persistence: source,
      ...(source === 'session'
        ? { warning: '仅本次会话有效，重启后需要重新输入 API Key。' }
        : {}),
    })
  }

  function getStatus() {
    const ai = providerStatus('ai')
    const search = providerStatus('search')
    return Object.freeze({
      configured: ai.configured && search.configured,
      ai,
      search,
      missing: Object.freeze(PROVIDERS
        .filter((provider) => sources[provider] === 'none')
        .map((provider) => `${provider}.apiKey`)),
    })
  }

  async function initialize() {
    let storedVersion = 0
    try {
      const stored = validateStoredConnection(JSON.parse(await readFile(connectionPath, 'utf8')))
      storedVersion = stored.version
      for (const provider of PROVIDERS) {
        if (stored.connections[provider]) encryptedRecords[provider] = stored.connections[provider]
      }
      if (!encryptionAvailable()) {
        applyEnvironment('ai')
        applyEnvironment('search')
        if (externalConfig?.configured && sources.ai === 'none' && typeof externalGetApiKey === 'function') {
          sources.ai = 'external'
        }
        return getStatus()
      }

      for (const provider of PROVIDERS) {
        const record = encryptedRecords[provider]
        if (!record) continue
        const decrypted = String(
          safeStorage.decryptString(Buffer.from(record.encryptedApiKey, 'base64')),
        ).trim()
        if (!decrypted) {
          throw connectionError('EMPTY_STORED_KEY', `Stored ${DEFINITIONS[provider].label} key is empty.`)
        }
        sources[provider] = 'encrypted'
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') await quarantineInvalidStore()
      for (const provider of PROVIDERS) {
        encryptedRecords[provider] = null
        sources[provider] = 'none'
      }
    }

    if (storedVersion === 1) await persistEncryptedStore()

    if (externalConfig?.configured && sources.ai !== 'environment' && typeof externalGetApiKey === 'function') {
      sources.ai = 'external'
    }
    applyEnvironment('ai')
    applyEnvironment('search')
    return getStatus()
  }

  async function save(input) {
    const sanitized = sanitizeConnectionInput(input)
    const canEncrypt = encryptionAvailable()

    for (const provider of PROVIDERS) {
      const connection = sanitized[provider]
      if (!connection) continue
      invalidatedEnvironment.add(provider)
      environmentApiKeys[provider] = ''

      if (!canEncrypt) {
        sessionApiKeys[provider] = connection.apiKey
        sources[provider] = 'session'
        continue
      }

      const encryptedApiKey = safeStorage.encryptString(connection.apiKey).toString('base64')
      encryptedRecords[provider] = {
        provider: DEFINITIONS[provider].provider,
        endpoint: connection.endpoint,
        model: DEFINITIONS[provider].model,
        encryptedApiKey,
        updatedAt: new Date(now()).toISOString(),
      }
      sessionApiKeys[provider] = ''
      sources[provider] = 'encrypted'
    }

    if (canEncrypt) await persistEncryptedStore()
    return getStatus()
  }

  async function invalidate(provider) {
    const selected = assertKnownProvider(provider)
    invalidatedEnvironment.add(selected)
    encryptedRecords[selected] = null
    sessionApiKeys[selected] = ''
    environmentApiKeys[selected] = ''
    sources[selected] = 'none'
    await persistEncryptedStore()
    return getStatus()
  }

  async function clear(provider) {
    if (provider) return invalidate(provider)
    for (const selected of PROVIDERS) {
      invalidatedEnvironment.add(selected)
      encryptedRecords[selected] = null
      sessionApiKeys[selected] = ''
      environmentApiKeys[selected] = ''
      sources[selected] = 'none'
    }
    await rm(connectionPath, { force: true })
    return getStatus()
  }

  async function getApiKey(provider = 'ai') {
    const selected = assertKnownProvider(provider)
    const source = sources[selected]
    if (source === 'environment') return environmentApiKeys[selected]
    if (source === 'external' && selected === 'ai') {
      const value = String(await externalGetApiKey()).trim()
      if (value) return value
    }
    if (source === 'session' && sessionApiKeys[selected]) return sessionApiKeys[selected]
    if (source === 'encrypted' && encryptedRecords[selected]) {
      const value = String(safeStorage.decryptString(
        Buffer.from(encryptedRecords[selected].encryptedApiKey, 'base64'),
      )).trim()
      if (value) return value
    }
    throw connectionError(
      'NOT_CONFIGURED',
      `${DEFINITIONS[selected].label} connection is not configured.`,
    )
  }

  return Object.freeze({ initialize, getStatus, save, clear, invalidate, getApiKey })
}
