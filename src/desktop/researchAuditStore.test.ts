import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createResearchHistoryStore } from '../../electron/research-history-store.mjs'

const stores: Array<{ close: () => void }> = []

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-audit-'))
  const store = createResearchHistoryStore({
    dbPath: path.join(directory, 'research.sqlite'),
    now: () => 1_721_776_000_000,
  })
  stores.push(store)
  store.startRun({
    id: 'adaptive-run',
    game: '崩坏：星穹铁道',
    version: '2.0',
    regions: ['CN', 'JP', 'WEST'],
  })
  return store
}

afterEach(() => {
  while (stores.length) stores.pop()?.close()
})

describe('research route and browser audit persistence', () => {
  it('round-trips routing percentages, candidates, and real browser actions', async () => {
    const store = await createStore()
    store.appendRouteSnapshot('adaptive-run', {
      id: 'route-cn-12',
      region: 'CN',
      selectedRoute: 'openai_search',
      phase: 'adaptive',
      revision: 1,
      weights: { openai_search: 58, bigmodel_search: 23, webfetch: 19 },
      stats: {
        openai_search: { attempts: 6, successfulAttempts: 4 },
        bigmodel_search: { attempts: 3, successfulAttempts: 1 },
        webfetch: { attempts: 3, successfulAttempts: 0 },
      },
    })
    store.appendCandidate('adaptive-run', {
      id: 'candidate-west-1',
      region: 'WEST',
      provider: 'openai_search',
      query: 'Honkai Star Rail 2.0 player reactions',
      url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real',
      title: 'Player reactions',
      status: 'discovered',
    })
    store.appendBrowserObservation('adaptive-run', {
      id: 'browser-west-1-open',
      pageId: 'west-page-1',
      region: 'WEST',
      action: 'open',
      status: 'completed',
      url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real',
      title: 'Player reactions',
      statusCode: 200,
      screenshotDataUrl: 'data:image/jpeg;base64,cHJldmlldw==',
    })

    expect(store.getRun('adaptive-run')).toMatchObject({
      routeSnapshots: [expect.objectContaining({
        id: 'route-cn-12',
        selectedRoute: 'openai_search',
        weights: { openai_search: 58, bigmodel_search: 23, webfetch: 19 },
      })],
      candidates: [expect.objectContaining({
        id: 'candidate-west-1',
        provider: 'openai_search',
      })],
      browserObservations: [expect.objectContaining({
        id: 'browser-west-1-open',
        action: 'open',
        statusCode: 200,
      })],
    })
  })

  it('persists authentication pause/resume and WebFetch supplement attempts in order', async () => {
    const store = await createStore()
    store.appendAttempt('adaptive-run', {
      id: 'attempt-1',
      region: 'JP',
      action: 'auth_pause',
      provider: 'openai_search',
      status: 'waiting_for_credentials',
    })
    store.appendAttempt('adaptive-run', {
      id: 'attempt-2',
      region: 'JP',
      action: 'auth_resume',
      provider: 'openai_search',
      status: 'resumed',
    })
    store.appendAttempt('adaptive-run', {
      id: 'attempt-3',
      region: 'JP',
      action: 'fetch_supplement',
      provider: 'webfetch',
      status: 'completed',
      url: 'https://www.nicovideo.jp/watch/sm123',
    })

    expect(store.getRun('adaptive-run')?.attempts.map((attempt: { action: string }) => attempt.action))
      .toEqual(['auth_pause', 'auth_resume', 'fetch_supplement'])
  })

  it('rejects credential-shaped data and non-public candidate URLs before SQLite serialization', async () => {
    const store = await createStore()
    expect(() => store.appendAttempt('adaptive-run', {
      id: 'leak',
      region: 'CN',
      action: 'search_web',
      status: 'failed',
      apiKey: 'must-never-enter-sqlite',
    })).toThrow(/credential|secret/i)
    expect(() => store.appendCandidate('adaptive-run', {
      id: 'unsafe',
      region: 'CN',
      provider: 'webfetch',
      query: 'query',
      url: 'http://localhost/private',
      status: 'discovered',
    })).toThrow(/HTTPS/i)
  })
})
