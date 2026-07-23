import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BIGMODEL_CODING_ENDPOINT = 'https://open.bigmodel.cn/api/coding/paas/v4'
export const BIGMODEL_SEARCH_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4'
export const DEFAULT_GLM_MODEL = 'glm-5.2'

const CONNECTION_FILE = 'rehoyo-connection.json'

function connectionError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeEndpoint(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

export function sanitizeConnectionInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw connectionError('INVALID_INPUT', 'Invalid connection input.')
  }

  const keys = Object.keys(value)
  if (keys.some((key) => !['apiKey', 'endpoint'].includes(key))) {
    throw connectionError('INVALID_INPUT', 'Invalid connection input.')
  }

  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
  if (!apiKey || apiKey.length > 4096) {
    throw connectionError('INVALID_API_KEY', 'Enter a valid API key.')
  }

  const endpoint = normalizeEndpoint(value.endpoint)
  if (endpoint !== BIGMODEL_CODING_ENDPOINT) {
    throw connectionError(
      'UNSUPPORTED_ENDPOINT',
      'ReHoYo only supports the BigModel Coding endpoint.',
    )
  }

  return { apiKey, endpoint }
}

function unconfiguredStatus() {
  return Object.freeze({
    configured: false,
    provider: null,
    endpoint: BIGMODEL_CODING_ENDPOINT,
    endpointHost: null,
    model: null,
    persistence: 'none',
  })
}

function configuredStatus(persistence, warning) {
  return Object.freeze({
    configured: true,
    provider: 'bigmodel',
    endpoint: BIGMODEL_CODING_ENDPOINT,
    endpointHost: 'open.bigmodel.cn',
    model: DEFAULT_GLM_MODEL,
    persistence,
    ...(warning ? { warning } : {}),
  })
}

function validateStoredConnection(value) {
  if (
    !value || typeof value !== 'object' || Array.isArray(value) ||
    value.version !== 1 || value.provider !== 'bigmodel' ||
    normalizeEndpoint(value.endpoint) !== BIGMODEL_CODING_ENDPOINT ||
    value.model !== DEFAULT_GLM_MODEL ||
    typeof value.encryptedApiKey !== 'string' || !value.encryptedApiKey
  ) {
    throw connectionError('INVALID_STORED_CONNECTION', 'Stored connection is invalid.')
  }

  return value
}

export function createConnectionManager({
  userDataPath,
  safeStorage,
  externalConfig,
  externalGetApiKey,
  now = Date.now,
}) {
  if (!userDataPath || typeof userDataPath !== 'string') {
    throw new Error('A userData path is required.')
  }

  const connectionPath = path.join(userDataPath, CONNECTION_FILE)
  let source = 'none'
  let encryptedApiKey = ''
  let sessionApiKey = ''

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

  async function initialize() {
    if (externalConfig?.configured && typeof externalGetApiKey === 'function') {
      source = 'external'
      return getStatus()
    }

    try {
      const stored = validateStoredConnection(JSON.parse(await readFile(connectionPath, 'utf8')))
      if (!encryptionAvailable()) throw connectionError('ENCRYPTION_UNAVAILABLE', 'Encryption unavailable.')
      const decrypted = String(safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, 'base64'))).trim()
      if (!decrypted) throw connectionError('EMPTY_STORED_KEY', 'Stored API key is empty.')
      encryptedApiKey = stored.encryptedApiKey
      source = 'encrypted'
    } catch (error) {
      if (error?.code === 'ENCRYPTION_UNAVAILABLE') {
        source = 'none'
        encryptedApiKey = ''
        return getStatus()
      }
      if (error?.code !== 'ENOENT') await quarantineInvalidStore()
      source = 'none'
      encryptedApiKey = ''
    }
    return getStatus()
  }

  function getStatus() {
    if (source === 'external') return configuredStatus('external')
    if (source === 'encrypted') return configuredStatus('encrypted')
    if (source === 'session') {
      return configuredStatus('session', '仅本次会话有效，重启后需要重新输入 API Key。')
    }
    return unconfiguredStatus()
  }

  async function save(input) {
    const { apiKey, endpoint } = sanitizeConnectionInput(input)

    if (!encryptionAvailable()) {
      sessionApiKey = apiKey
      encryptedApiKey = ''
      source = 'session'
      return getStatus()
    }

    const encrypted = safeStorage.encryptString(apiKey).toString('base64')
    const stored = {
      version: 1,
      provider: 'bigmodel',
      endpoint,
      model: DEFAULT_GLM_MODEL,
      encryptedApiKey: encrypted,
      updatedAt: new Date(now()).toISOString(),
    }
    await mkdir(userDataPath, { recursive: true })
    const temporaryPath = `${connectionPath}.${process.pid}.${now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, connectionPath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }

    sessionApiKey = ''
    encryptedApiKey = encrypted
    source = 'encrypted'
    return getStatus()
  }

  async function clear() {
    source = 'none'
    encryptedApiKey = ''
    sessionApiKey = ''
    await rm(connectionPath, { force: true })
    return Object.freeze({ configured: false })
  }

  async function getApiKey() {
    if (source === 'external') {
      const value = String(await externalGetApiKey()).trim()
      if (!value) throw connectionError('EMPTY_API_KEY', 'GLM API key is empty.')
      return value
    }
    if (source === 'session' && sessionApiKey) return sessionApiKey
    if (source === 'encrypted' && encryptedApiKey) {
      const value = String(safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'))).trim()
      if (value) return value
    }
    throw connectionError('NOT_CONFIGURED', 'GLM connection is not configured.')
  }

  return Object.freeze({ initialize, getStatus, save, clear, getApiKey })
}
