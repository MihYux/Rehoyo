import { describe, expect, it, vi } from 'vitest'
import { collectWikiContext, getWikiSources } from '../../electron/wiki-context.mjs'

describe('wiki context collection', () => {
  it('collects real MediaWiki pages as context documents, never player evidence', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            42: {
              pageid: 42,
              title: url.includes('zh.wikipedia') ? '匹诺康尼' : 'Penacony',
              extract: 'Penacony is a location in Honkai: Star Rail and the setting of version 2.0.',
              fullurl: url.includes('zh.wikipedia')
                ? 'https://zh.wikipedia.org/wiki/%E5%8C%B9%E8%AF%BA%E5%BA%B7%E5%B0%BC'
                : 'https://en.wikipedia.org/wiki/Penacony',
            },
          },
        },
      }),
    }))

    const documents = await collectWikiContext({
      request: { gameName: '崩坏：星穹铁道', versionLabel: '2.0', versionTitle: '假如在午夜入梦' },
      fetchImpl,
    })

    expect(documents.length).toBeGreaterThanOrEqual(2)
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'context', source: 'Wikipedia', region: 'GLOBAL', url: expect.stringMatching(/^https:\/\//) }),
    ]))
    expect(documents.every((document) => document.role === 'context')).toBe(true)
    expect(new Set(documents.map((document) => document.url)).size).toBe(documents.length)
  })

  it('uses multiple relevant wiki APIs and tolerates a source failure', async () => {
    const sources = getWikiSources('绝区零')
    expect(sources.map((source) => source.name)).toEqual(expect.arrayContaining(['Wikipedia', 'Zenless Zone Zero Wiki']))

    const documents = await collectWikiContext({
      request: { gameName: '绝区零', versionLabel: '1.1', versionTitle: '卧底蓝调' },
      fetchImpl: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    })
    expect(documents).toEqual([])
  })
})
