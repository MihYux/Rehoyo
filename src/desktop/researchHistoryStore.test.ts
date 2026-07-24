import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createResearchHistoryStore } from '../../electron/research-history-store.mjs'

const openStores: Array<{ close: () => void }> = []

function openStore(dbPath: string) {
  const store = createResearchHistoryStore({ dbPath, now: () => 1_721_776_000_000 })
  openStores.push(store)
  return store
}

function realEvidence(id = 'evidence-cn-1') {
  return {
    id,
    runId: 'run-current',
    role: 'player',
    source: '米游社',
    sourceType: 'community',
    region: 'CN',
    language: 'zh-CN',
    author: '公开用户',
    title: '匹诺康尼版本讨论',
    url: `https://www.miyoushe.com/sr/article/${id}`,
    excerptOriginal: '玩家对匹诺康尼剧情节奏发表了可核验的公开评论。',
    excerptZh: '玩家对匹诺康尼剧情节奏发表了可核验的公开评论。',
    sentiment: 'neutral',
    topics: [],
    confidence: 0,
    engagement: 0,
    publishedLabel: '2024-02-10',
    retrievedAt: '2026-07-24T00:00:00.000Z',
    synthetic: false,
    contentKind: 'comment',
  }
}

describe('immutable research history store', () => {
  afterEach(() => {
    while (openStores.length) openStores.pop()?.close()
  })

  it('persists an incomplete run and resumes it after process restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-history-'))
    const dbPath = path.join(directory, 'research.sqlite')
    const first = openStore(dbPath)
    first.startRun({ id: 'run-current', game: '崩坏：星穹铁道', version: '2.0', regions: ['CN', 'JP', 'WEST'] })
    first.appendAttempt('run-current', { id: 'attempt-1', region: 'CN', action: 'open_page', status: 'completed', url: 'https://www.miyoushe.com/sr/article/evidence-cn-1' })
    first.appendEvidence('run-current', realEvidence())
    first.finishRun('run-current', { status: 'incomplete', limitations: ['JP 仍缺少 30 条'] })
    first.close()
    openStores.pop()

    const restored = openStore(dbPath).getRun('run-current')
    expect(restored).toMatchObject({ id: 'run-current', status: 'incomplete', game: '崩坏：星穹铁道' })
    expect(restored?.evidence).toEqual([expect.objectContaining({ id: 'evidence-cn-1', synthetic: false })])
    expect(restored?.attempts).toEqual([expect.objectContaining({ id: 'attempt-1', status: 'completed' })])
  })

  it('rejects duplicate or unverified evidence instead of mutating history', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-history-'))
    const store = openStore(path.join(directory, 'research.sqlite'))
    store.startRun({ id: 'run-current', game: '崩坏：星穹铁道', version: '2.0', regions: ['CN'] })
    store.appendEvidence('run-current', realEvidence())

    expect(() => store.appendEvidence('run-current', realEvidence())).toThrow(/duplicate/i)
    expect(() => store.appendEvidence('run-current', { ...realEvidence('synthetic'), synthetic: true })).toThrow(/synthetic/i)
    expect(() => store.appendEvidence('run-current', { ...realEvidence('wiki'), role: 'context', source: 'Wikipedia' })).toThrow(/player/i)
    expect(() => store.appendEvidence('run-current', { ...realEvidence('http'), url: 'http://example.com/comment' })).toThrow(/HTTPS/i)
    expect(store.getRun('run-current')?.evidence).toHaveLength(1)
  })

  it('keeps reports and baseline candidates separated by completed run', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-history-'))
    const store = openStore(path.join(directory, 'research.sqlite'))
    for (const [id, version] of [['run-old', '1.6'], ['run-current', '2.0']] as const) {
      store.startRun({ id, game: '崩坏：星穹铁道', version, regions: ['CN', 'JP', 'WEST'] })
      store.appendEvidence(id, { ...realEvidence(`${id}-evidence`), id: `${id}-evidence`, runId: id })
      store.saveReport(id, { summary: `${version} 真实历史报告`, sampleCount: 1 })
      store.finishRun(id, { status: 'complete', limitations: [] })
    }

    expect(store.getBaselineCandidates({ game: '崩坏：星穹铁道', excludeRunId: 'run-current' }))
      .toEqual([expect.objectContaining({ id: 'run-old', version: '1.6' })])
    expect(store.getEvidenceForRuns(['run-old'])).toEqual([expect.objectContaining({ runId: 'run-old' })])
    expect(store.getRun('run-current')?.report).toMatchObject({ summary: '2.0 真实历史报告', sampleCount: 1 })
  })
})
