import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConnectionClient, type ConnectionStatus } from './bridge'

afterEach(() => { delete window.rehoyoDesktop })

describe('secure dual-provider connection IPC bridge', () => {
  it('exposes only public provider status and no credential fields', async () => {
    const publicStatus: ConnectionStatus = {
      configured: false,
      ai: {
        configured: true,
        provider: 'bigmodel',
        endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-5.2',
        persistence: 'encrypted',
      },
      search: {
        configured: false,
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-5.6',
        persistence: 'none',
      },
      missing: ['search.apiKey'],
    }
    const connection = {
      getStatus: vi.fn(async () => publicStatus), save: vi.fn(), clear: vi.fn(), invalidate: vi.fn(),
    }
    window.rehoyoDesktop = { isElectron: true, platform: 'win32', connection }

    expect(getConnectionClient()).toBe(connection)
    const received = await getConnectionClient()?.getStatus()
    expect(received).not.toHaveProperty('apiKey')
    expect(received).not.toHaveProperty('encryptedApiKey')
    expect(received?.ai).not.toHaveProperty('apiKey')
    expect(received?.search).not.toHaveProperty('apiKey')
  })

  it('registers narrow status/save/clear/invalidate IPC without a renderer key getter', async () => {
    const root = process.cwd()
    const [mainSource, preloadSource] = await Promise.all([
      readFile(path.join(root, 'electron/main.mjs'), 'utf8'),
      readFile(path.join(root, 'electron/preload.cjs'), 'utf8'),
    ])

    for (const channel of [
      'rehoyo:connection:status',
      'rehoyo:connection:save',
      'rehoyo:connection:clear',
      'rehoyo:connection:invalidate',
    ]) {
      expect(mainSource).toContain(channel)
      expect(preloadSource).toContain(channel)
    }
    expect(mainSource).toContain('safeStorage')
    expect(mainSource).toContain('loadEnvFile')
    expect(mainSource).toContain("path.join(appRoot, '.env')")
    expect(preloadSource).not.toContain('getApiKey')
    expect(preloadSource).not.toContain('encryptedApiKey')
    expect(preloadSource).not.toContain('keyFile')
  })
})
