import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalRagStore } from '../../electron/local-rag-store.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('local research RAG store', () => {
  it('persists public pages and retrieves task-scoped context without mixing evidence roles', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-rag-'))
    temporaryDirectories.push(directory)
    const dbPath = path.join(directory, 'research.sqlite')
    const runId = 'hsr-2.0-run'
    const store = createLocalRagStore({ dbPath, now: () => 1_721_000_000_000 })

    store.indexDocuments({
      runId,
      game: '崩坏：星穹铁道',
      version: '2.0',
      documents: [
        {
          id: 'wiki-penacony', role: 'context', source: 'Wikipedia', region: 'GLOBAL', language: 'zh-CN',
          title: '匹诺康尼', url: 'https://zh.wikipedia.org/wiki/匹诺康尼',
          text: '匹诺康尼是星穹铁道 2.0 的主要舞台，黑天鹅是该版本公开角色之一。',
        },
        {
          id: 'player-west-1', role: 'player', source: 'Reddit', region: 'WEST', language: 'en-US',
          title: 'Penacony reactions', url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real/',
          text: 'Players praised Black Swan and the music but debated the story pacing.',
        },
        {
          id: 'other-game', role: 'context', source: 'Wikipedia', region: 'GLOBAL', language: 'zh-CN',
          title: '纳塔', url: 'https://zh.wikipedia.org/wiki/纳塔', text: '纳塔是另一个游戏版本的区域。',
        },
      ],
    })

    expect(store.getStats(runId)).toMatchObject({ documents: 3, contextDocuments: 2, playerDocuments: 1 })
    expect(store.retrieve('匹诺康尼 黑天鹅 角色', { runId, roles: ['context'], limit: 2 })).toEqual([
      expect.objectContaining({ documentId: 'wiki-penacony', role: 'context', source: 'Wikipedia' }),
    ])
    expect(store.retrieve('Black Swan music pacing', { runId, roles: ['player'], limit: 2 })).toEqual([
      expect.objectContaining({ documentId: 'player-west-1', role: 'player', source: 'Reddit' }),
    ])
    store.close()

    const reopened = createLocalRagStore({ dbPath })
    expect(reopened.getStats(runId).documents).toBe(3)
    expect(reopened.retrieve('匹诺康尼', { runId, limit: 1 })[0]).toMatchObject({ documentId: 'wiki-penacony' })
    reopened.close()
  })
})
