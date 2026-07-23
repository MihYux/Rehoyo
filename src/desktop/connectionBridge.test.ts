import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConnectionClient } from './bridge'

afterEach(() => {
  delete window.rehoyoDesktop
})

describe('secure connection IPC bridge', () => {
  it('exposes the renderer connection client without returning credential fields', async () => {
    const connection = {
      getStatus: vi.fn(async () => ({
        configured: false,
        provider: null,
        endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
        endpointHost: null,
        model: null,
        persistence: 'none' as const,
      })),
      save: vi.fn(),
      clear: vi.fn(),
    }
    window.rehoyoDesktop = { isElectron: true, platform: 'win32', connection }

    expect(getConnectionClient()).toBe(connection)
    expect(await getConnectionClient()?.getStatus()).not.toHaveProperty('apiKey')
    expect(await getConnectionClient()?.getStatus()).not.toHaveProperty('encryptedApiKey')
  })

  it('registers only the narrow status, save, and clear connection channels', async () => {
    const root = process.cwd()
    const [mainSource, preloadSource] = await Promise.all([
      readFile(path.join(root, 'electron/main.mjs'), 'utf8'),
      readFile(path.join(root, 'electron/preload.cjs'), 'utf8'),
    ])

    for (const channel of [
      'rehoyo:connection:status',
      'rehoyo:connection:save',
      'rehoyo:connection:clear',
    ]) {
      expect(mainSource).toContain(channel)
      expect(preloadSource).toContain(channel)
    }
    expect(mainSource).toContain('safeStorage')
    expect(preloadSource).not.toContain('encryptedApiKey')
    expect(preloadSource).not.toContain('keyFile')
  })
})
