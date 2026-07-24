import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BIGMODEL_CODING_ENDPOINT,
  DEFAULT_GLM_MODEL,
  DEFAULT_OPENAI_MODEL,
  OPENAI_API_ENDPOINT,
  createConnectionManager,
  sanitizeConnectionInput,
} from '../../electron/connection-manager.mjs'

const createdDirectories: string[] = []

async function createUserDataDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-connection-'))
  createdDirectories.push(directory)
  return directory
}

function createSafeStorage(available = true) {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => {
      const text = value.toString('utf8')
      if (!text.startsWith('encrypted:')) throw new Error('invalid ciphertext')
      return text.slice('encrypted:'.length)
    }),
  }
}

function bothConnections(aiKey = 'private-ai-key', searchKey = 'private-search-key') {
  return {
    ai: { apiKey: aiKey, endpoint: BIGMODEL_CODING_ENDPOINT },
    search: { apiKey: searchKey, endpoint: OPENAI_API_ENDPOINT },
  }
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('secure dual-provider Electron connection manager', () => {
  it('sanitizes the two bounded provider connections and rejects unknown fields or endpoints', () => {
    expect(sanitizeConnectionInput({
      ai: { apiKey: '  private-ai-key  ', endpoint: `${BIGMODEL_CODING_ENDPOINT}/` },
      search: { apiKey: '  private-search-key  ', endpoint: `${OPENAI_API_ENDPOINT}/` },
    })).toEqual(bothConnections())

    expect(() => sanitizeConnectionInput({
      ai: { apiKey: 'private-ai-key', endpoint: 'https://example.com/v4' },
    })).toThrow(/BigModel/i)
    expect(() => sanitizeConnectionInput({
      search: { apiKey: 'private-search-key', endpoint: 'https://example.com/v1' },
    })).toThrow(/OpenAI/i)
    expect(() => sanitizeConnectionInput({
      ai: { apiKey: 'private-ai-key', endpoint: BIGMODEL_CODING_ENDPOINT, extra: true },
    })).toThrow(/invalid connection input/i)
    expect(() => sanitizeConnectionInput({
      search: { apiKey: 'x'.repeat(4097), endpoint: OPENAI_API_ENDPOINT },
    })).toThrow(/API key/i)
  })

  it('encrypts both keys separately and never exposes credential material in status or disk', async () => {
    const userDataPath = await createUserDataDirectory()
    const safeStorage = createSafeStorage()
    const manager = createConnectionManager({ userDataPath, safeStorage })

    await manager.initialize()
    const status = await manager.save(bothConnections())

    expect(status).toEqual({
      configured: true,
      ai: {
        configured: true,
        provider: 'bigmodel',
        endpoint: BIGMODEL_CODING_ENDPOINT,
        model: DEFAULT_GLM_MODEL,
        persistence: 'encrypted',
      },
      search: {
        configured: true,
        provider: 'openai',
        endpoint: OPENAI_API_ENDPOINT,
        model: DEFAULT_OPENAI_MODEL,
        persistence: 'encrypted',
      },
      missing: [],
    })
    expect(safeStorage.encryptString).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(status)).not.toContain('private-ai-key')
    expect(JSON.stringify(status)).not.toContain('private-search-key')
    expect(JSON.stringify(status)).not.toContain('encryptedApiKey')
    expect(await manager.getApiKey('ai')).toBe('private-ai-key')
    expect(await manager.getApiKey('search')).toBe('private-search-key')

    const storedText = await readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')
    expect(storedText).not.toContain('private-ai-key')
    expect(storedText).not.toContain('private-search-key')
    expect(JSON.parse(storedText)).toMatchObject({
      version: 2,
      connections: {
        ai: { provider: 'bigmodel', endpoint: BIGMODEL_CODING_ENDPOINT, model: DEFAULT_GLM_MODEL },
        search: { provider: 'openai', endpoint: OPENAI_API_ENDPOINT, model: DEFAULT_OPENAI_MODEL },
      },
    })

    const restored = createConnectionManager({ userDataPath, safeStorage })
    await restored.initialize()
    expect(restored.getStatus()).toMatchObject({ configured: true, missing: [] })
    expect(await restored.getApiKey('ai')).toBe('private-ai-key')
    expect(await restored.getApiKey('search')).toBe('private-search-key')
  })

  it('supports partial setup and reports only the still-missing provider key', async () => {
    const manager = createConnectionManager({
      userDataPath: await createUserDataDirectory(),
      safeStorage: createSafeStorage(),
    })
    await manager.initialize()

    const status = await manager.save({
      ai: { apiKey: 'private-ai-key', endpoint: BIGMODEL_CODING_ENDPOINT },
    })

    expect(status).toMatchObject({
      configured: false,
      ai: { configured: true, persistence: 'encrypted' },
      search: { configured: false, persistence: 'none' },
      missing: ['search.apiKey'],
    })
    expect(await manager.getApiKey('ai')).toBe('private-ai-key')
    await expect(manager.getApiKey('search')).rejects.toThrow(/OpenAI.*not configured/i)
  })

  it('migrates a v1 BigModel store without losing its encrypted key and asks only for OpenAI', async () => {
    const userDataPath = await createUserDataDirectory()
    const safeStorage = createSafeStorage()
    await writeFile(path.join(userDataPath, 'rehoyo-connection.json'), JSON.stringify({
      version: 1,
      provider: 'bigmodel',
      endpoint: BIGMODEL_CODING_ENDPOINT,
      model: DEFAULT_GLM_MODEL,
      encryptedApiKey: Buffer.from('encrypted:legacy-ai-key').toString('base64'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    }), 'utf8')
    const manager = createConnectionManager({ userDataPath, safeStorage })

    await manager.initialize()

    expect(manager.getStatus()).toMatchObject({
      configured: false,
      ai: { configured: true, persistence: 'encrypted' },
      search: { configured: false },
      missing: ['search.apiKey'],
    })
    expect(await manager.getApiKey('ai')).toBe('legacy-ai-key')
    const migrated = JSON.parse(await readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8'))
    expect(migrated).toMatchObject({ version: 2, connections: { ai: { provider: 'bigmodel' } } })
    expect(migrated.connections.search).toBeUndefined()
  })

  it('uses environment credentials ahead of encrypted storage without exposing them', async () => {
    const userDataPath = await createUserDataDirectory()
    const safeStorage = createSafeStorage()
    const saved = createConnectionManager({ userDataPath, safeStorage })
    await saved.initialize()
    await saved.save(bothConnections('saved-ai-key', 'saved-search-key'))

    const manager = createConnectionManager({
      userDataPath,
      safeStorage,
      environment: {
        REHOYO_BIGMODEL_API_KEY: 'environment-ai-key',
        REHOYO_BIGMODEL_ENDPOINT: BIGMODEL_CODING_ENDPOINT,
        REHOYO_OPENAI_API_KEY: 'environment-search-key',
        REHOYO_OPENAI_ENDPOINT: OPENAI_API_ENDPOINT,
      },
    })
    await manager.initialize()

    expect(manager.getStatus()).toMatchObject({
      configured: true,
      ai: { persistence: 'environment' },
      search: { persistence: 'environment' },
      missing: [],
    })
    expect(JSON.stringify(manager.getStatus())).not.toContain('environment-ai-key')
    expect(JSON.stringify(manager.getStatus())).not.toContain('environment-search-key')
    expect(await manager.getApiKey('ai')).toBe('environment-ai-key')
    expect(await manager.getApiKey('search')).toBe('environment-search-key')
  })

  it('keeps both credentials in separate session memory when encryption is unavailable', async () => {
    const userDataPath = await createUserDataDirectory()
    const manager = createConnectionManager({ userDataPath, safeStorage: createSafeStorage(false) })
    await manager.initialize()

    const status = await manager.save(bothConnections('session-ai-key', 'session-search-key'))

    expect(status).toMatchObject({
      configured: true,
      ai: { persistence: 'session', warning: expect.stringMatching(/会话|session/i) },
      search: { persistence: 'session', warning: expect.stringMatching(/会话|session/i) },
    })
    expect(await manager.getApiKey('ai')).toBe('session-ai-key')
    expect(await manager.getApiKey('search')).toBe('session-search-key')
    await expect(readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves encrypted provider records when encryption is temporarily unavailable', async () => {
    const userDataPath = await createUserDataDirectory()
    const available = createConnectionManager({ userDataPath, safeStorage: createSafeStorage() })
    await available.initialize()
    await available.save(bothConnections())

    const unavailable = createConnectionManager({ userDataPath, safeStorage: createSafeStorage(false) })
    await unavailable.initialize()
    expect(unavailable.getStatus()).toMatchObject({ configured: false })

    await unavailable.invalidate('search')

    const stored = JSON.parse(await readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8'))
    expect(stored).toMatchObject({ version: 2, connections: { ai: { provider: 'bigmodel' } } })
    expect(stored.connections.search).toBeUndefined()
  })

  it('invalidates one provider without clearing the other provider', async () => {
    const userDataPath = await createUserDataDirectory()
    const manager = createConnectionManager({ userDataPath, safeStorage: createSafeStorage() })
    await manager.initialize()
    await manager.save(bothConnections())

    const status = await manager.invalidate('search')

    expect(status).toMatchObject({
      configured: false,
      ai: { configured: true },
      search: { configured: false },
      missing: ['search.apiKey'],
    })
    expect(await manager.getApiKey('ai')).toBe('private-ai-key')
    await expect(manager.getApiKey('search')).rejects.toThrow(/not configured/i)
    expect(JSON.parse(await readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')))
      .toMatchObject({ version: 2, connections: { ai: { provider: 'bigmodel' } } })
  })

  it('quarantines a corrupt store and returns a safe unconfigured status', async () => {
    const userDataPath = await createUserDataDirectory()
    await writeFile(path.join(userDataPath, 'rehoyo-connection.json'), '{not-json', 'utf8')
    const manager = createConnectionManager({ userDataPath, safeStorage: createSafeStorage(), now: () => 123 })

    await manager.initialize()

    expect(manager.getStatus()).toMatchObject({
      configured: false,
      ai: { configured: false },
      search: { configured: false },
      missing: ['ai.apiKey', 'search.apiKey'],
    })
    expect(await readdir(userDataPath)).toContain('rehoyo-connection.json.123.invalid')
  })
})
