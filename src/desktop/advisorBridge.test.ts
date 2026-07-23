import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLiveAdvisorClient, type LiveAdvisorClient } from './bridge'

afterEach(() => {
  delete window.rehoyoDesktop
})

describe('streaming advisor IPC bridge', () => {
  it('exposes a request-scoped stream client to the renderer', async () => {
    const unsubscribe = vi.fn()
    const client = {
      getStatus: vi.fn(async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' })),
      ask: vi.fn(async () => ({ ok: false as const, error: 'Legacy path is not used.' })),
      stream: vi.fn(async ({ requestId }: { requestId: string }) => ({
        ok: true as const,
        content: 'Grounded response',
        model: 'glm-5.2',
        requestId,
      })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      onEvent: vi.fn(() => unsubscribe),
    } satisfies LiveAdvisorClient
    window.rehoyoDesktop = { isElectron: true, platform: 'win32', advisor: client }

    expect(getLiveAdvisorClient()).toBe(client)
    expect(getLiveAdvisorClient()?.onEvent?.(vi.fn())).toBe(unsubscribe)
    expect(await getLiveAdvisorClient()?.cancel?.('request-1')).toEqual({ ok: true })
  })

  it('registers narrow stream, cancel, and lifecycle event channels', async () => {
    const root = process.cwd()
    const [mainSource, preloadSource] = await Promise.all([
      readFile(path.join(root, 'electron/main.mjs'), 'utf8'),
      readFile(path.join(root, 'electron/preload.cjs'), 'utf8'),
    ])

    for (const channel of [
      'rehoyo:advisor:stream',
      'rehoyo:advisor:cancel',
      'rehoyo:advisor:event',
    ]) {
      expect(mainSource + preloadSource).toContain(channel)
    }
    expect(mainSource).toContain('activeAdvisorStreams')
    expect(mainSource).toContain('AbortController')
    expect(preloadSource).toContain("ipcRenderer.removeListener('rehoyo:advisor:event', handler)")
    expect(preloadSource).not.toContain('apiKey')
    expect(preloadSource).not.toContain('encryptedApiKey')
  })
})
