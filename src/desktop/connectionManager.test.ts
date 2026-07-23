import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BIGMODEL_CODING_ENDPOINT,
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

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('secure Electron connection manager', () => {
  it('accepts only bounded credentials for the BigModel Coding endpoint', () => {
    expect(sanitizeConnectionInput({
      apiKey: '  private-test-key  ',
      endpoint: `${BIGMODEL_CODING_ENDPOINT}/`,
    })).toEqual({
      apiKey: 'private-test-key',
      endpoint: BIGMODEL_CODING_ENDPOINT,
    })

    expect(() => sanitizeConnectionInput({
      apiKey: 'private-test-key',
      endpoint: 'https://example.com/v4',
    })).toThrow(/BigModel Coding endpoint/i)
    expect(() => sanitizeConnectionInput({
      apiKey: 'private-test-key',
      endpoint: BIGMODEL_CODING_ENDPOINT,
      extra: 'not-allowed',
    })).toThrow(/invalid connection input/i)
    expect(() => sanitizeConnectionInput({
      apiKey: 'x'.repeat(4097),
      endpoint: BIGMODEL_CODING_ENDPOINT,
    })).toThrow(/API key/i)
  })

  it('encrypts the key at rest and restores it without exposing credential material in status', async () => {
    const userDataPath = await createUserDataDirectory()
    const safeStorage = createSafeStorage()
    const manager = createConnectionManager({ userDataPath, safeStorage })

    await manager.initialize()
    const status = await manager.save({
      apiKey: 'private-test-key',
      endpoint: BIGMODEL_CODING_ENDPOINT,
    })

    expect(status).toEqual({
      configured: true,
      provider: 'bigmodel',
      endpoint: BIGMODEL_CODING_ENDPOINT,
      endpointHost: 'open.bigmodel.cn',
      model: 'glm-5.2',
      persistence: 'encrypted',
    })
    expect(JSON.stringify(status)).not.toContain('private-test-key')
    expect(JSON.stringify(status)).not.toContain('encryptedApiKey')
    expect(await manager.getApiKey()).toBe('private-test-key')

    const storedText = await readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')
    expect(storedText).not.toContain('private-test-key')
    expect(JSON.parse(storedText)).toMatchObject({
      version: 1,
      provider: 'bigmodel',
      endpoint: BIGMODEL_CODING_ENDPOINT,
      model: 'glm-5.2',
    })

    const restored = createConnectionManager({ userDataPath, safeStorage })
    await restored.initialize()
    expect(restored.getStatus()).toMatchObject({ configured: true, persistence: 'encrypted' })
    expect(await restored.getApiKey()).toBe('private-test-key')
  })

  it('uses session-only memory when operating-system encryption is unavailable', async () => {
    const userDataPath = await createUserDataDirectory()
    const manager = createConnectionManager({
      userDataPath,
      safeStorage: createSafeStorage(false),
    })

    await manager.initialize()
    const status = await manager.save({
      apiKey: 'session-test-key',
      endpoint: BIGMODEL_CODING_ENDPOINT,
    })

    expect(status).toMatchObject({
      configured: true,
      persistence: 'session',
      warning: expect.stringMatching(/session|会话/i),
    })
    expect(await manager.getApiKey()).toBe('session-test-key')
    await expect(readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves a valid encrypted store when operating-system encryption is temporarily unavailable', async () => {
    const userDataPath = await createUserDataDirectory()
    const availableManager = createConnectionManager({
      userDataPath,
      safeStorage: createSafeStorage(true),
    })
    await availableManager.initialize()
    await availableManager.save({ apiKey: 'private-test-key', endpoint: BIGMODEL_CODING_ENDPOINT })

    const unavailableManager = createConnectionManager({
      userDataPath,
      safeStorage: createSafeStorage(false),
    })
    await unavailableManager.initialize()

    expect(unavailableManager.getStatus()).toMatchObject({ configured: false, persistence: 'none' })
    const files = await readdir(userDataPath)
    expect(files).toContain('rehoyo-connection.json')
    expect(files.some((file) => file.endsWith('.invalid'))).toBe(false)
  })

  it('prefers an explicit external configuration without exposing its key file', async () => {
    const userDataPath = await createUserDataDirectory()
    const externalGetApiKey = vi.fn(async () => 'external-test-key')
    const manager = createConnectionManager({
      userDataPath,
      safeStorage: createSafeStorage(),
      externalConfig: {
        configured: true,
        baseUrl: BIGMODEL_CODING_ENDPOINT,
        searchBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-5.2',
        keyFile: 'C:/private/glm-key.txt',
      },
      externalGetApiKey,
    })

    await manager.initialize()

    expect(manager.getStatus()).toEqual({
      configured: true,
      provider: 'bigmodel',
      endpoint: BIGMODEL_CODING_ENDPOINT,
      endpointHost: 'open.bigmodel.cn',
      model: 'glm-5.2',
      persistence: 'external',
    })
    expect(JSON.stringify(manager.getStatus())).not.toContain('glm-key.txt')
    expect(await manager.getApiKey()).toBe('external-test-key')
    expect(externalGetApiKey).toHaveBeenCalledOnce()
  })

  it('quarantines a corrupt store and returns to an unconfigured state', async () => {
    const userDataPath = await createUserDataDirectory()
    await writeFile(path.join(userDataPath, 'rehoyo-connection.json'), '{not-json', 'utf8')
    const manager = createConnectionManager({ userDataPath, safeStorage: createSafeStorage() })

    await manager.initialize()

    expect(manager.getStatus()).toMatchObject({ configured: false, persistence: 'none' })
    const files = await readdir(userDataPath)
    expect(files.some((file) => /^rehoyo-connection\.json\.\d+\.invalid$/.test(file))).toBe(true)
    await expect(manager.getApiKey()).rejects.toThrow(/not configured/i)
  })

  it('clears encrypted and in-memory connection state', async () => {
    const userDataPath = await createUserDataDirectory()
    const manager = createConnectionManager({ userDataPath, safeStorage: createSafeStorage() })
    await manager.initialize()
    await manager.save({ apiKey: 'private-test-key', endpoint: BIGMODEL_CODING_ENDPOINT })

    expect(await manager.clear()).toEqual({ configured: false })
    expect(manager.getStatus()).toMatchObject({ configured: false, persistence: 'none' })
    await expect(manager.getApiKey()).rejects.toThrow(/not configured/i)
    await expect(readFile(path.join(userDataPath, 'rehoyo-connection.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
