import { describe, expect, it, vi } from 'vitest'
import { createHeadlessResearchBrowser, validatePublicHttpsUrl } from '../../electron/headless-research-browser.mjs'

function fakePage(url: string) {
  return {
    goto: vi.fn(async () => ({ ok: () => true, status: () => 200 })),
    title: vi.fn(async () => url.includes('wiki') ? '匹诺康尼 - Wikipedia' : '玩家讨论'),
    locator: vi.fn(() => ({
      innerText: vi.fn(async () => url.includes('wiki')
        ? '匹诺康尼是版本舞台，黑天鹅是公开角色。'
        : 'I loved Black Swan and the music, but the pacing was confusing.'),
    })),
    evaluate: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  }
}

describe('headless public-page research browser', () => {
  it('keeps an AI-controlled page session open across navigation, scroll, extraction, and screenshots', async () => {
    const page = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'HSR 2.0 玩家讨论'),
      locator: vi.fn((selector: string) => selector === 'body' ? {
        innerText: vi.fn(async () => 'Black Swan is great, but the Penacony pacing is confusing.'),
      } : {
        allInnerTexts: vi.fn(async () => ['Black Swan is great.', 'The story pacing is confusing.']),
      }),
      evaluate: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => Buffer.from('preview')),
      click: vi.fn(async () => undefined),
      fill: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }
    const context = { newPage: vi.fn(async () => page), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const observations: Array<{ action?: string; screenshotDataUrl?: string }> = []
    const researchBrowser = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => browser) },
      onObservation: (observation) => observations.push(observation),
    })

    const opened = await researchBrowser.open({
      id: 'jp-page', url: 'https://www.nicovideo.jp/watch/sm-real', role: 'player', source: 'Niconico', region: 'JP', language: 'ja-JP',
    }, { runId: 'run-live', agentId: 'research' })
    await researchBrowser.scroll(opened.pageId, { direction: 'down', amount: 1200 })
    const comments = await researchBrowser.extractVisibleComments(opened.pageId, { selectors: ['.comment'] })
    const preview = await researchBrowser.screenshot(opened.pageId)
    await researchBrowser.close()

    expect(page.goto).toHaveBeenCalledOnce()
    expect(page.evaluate).toHaveBeenCalled()
    expect(comments).toEqual(['Black Swan is great.', 'The story pacing is confusing.'])
    expect(preview).toMatch(/^data:image\/jpeg;base64,/)
    expect(observations.some((item) => item.action === 'open' && item.screenshotDataUrl?.startsWith('data:image/jpeg'))).toBe(true)
    expect(page.close).toHaveBeenCalledOnce()
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('launches invisibly, extracts visible pages, and emits observable actions', async () => {
    const pages = [fakePage('https://en.wikipedia.org/wiki/Penacony'), fakePage('https://www.reddit.com/r/HonkaiStarRail/comments/real')]
    const context = {
      newPage: vi.fn(async () => pages.shift()),
      route: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const browserType = { launch: vi.fn(async () => browser) }
    const observations: Array<{ status: string; url: string; title?: string; action?: string }> = []
    const researchBrowser = createHeadlessResearchBrowser({
      browserType,
      maxConcurrency: 2,
      onObservation: (observation) => observations.push(observation),
    })

    const documents = await researchBrowser.observe([
      { id: 'wiki-1', url: 'https://en.wikipedia.org/wiki/Penacony', role: 'context', source: 'Wikipedia', region: 'GLOBAL', language: 'en-US' },
      { id: 'player-1', url: 'https://www.reddit.com/r/HonkaiStarRail/comments/real', role: 'player', source: 'Reddit', region: 'WEST', language: 'en-US' },
    ], { runId: 'run-1', agentId: 'research' })

    expect(browserType.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'wiki-1', title: '匹诺康尼 - Wikipedia', text: expect.stringContaining('黑天鹅') }),
      expect.objectContaining({ id: 'player-1', text: expect.stringContaining('Black Swan') }),
    ]))
    expect(observations.filter((item) => item.status === 'navigating')).toHaveLength(2)
    expect(observations.filter((item) => item.status === 'completed' && item.action === 'open')).toHaveLength(2)
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('rejects unsafe or non-HTTPS targets before browser navigation', () => {
    expect(() => validatePublicHttpsUrl('http://example.com')).toThrow(/HTTPS/)
    expect(() => validatePublicHttpsUrl('https://127.0.0.1/private')).toThrow(/public/i)
    expect(() => validatePublicHttpsUrl('https://localhost/internal')).toThrow(/public/i)
    expect(validatePublicHttpsUrl('https://en.wikipedia.org/wiki/Honkai:_Star_Rail')).toBe('https://en.wikipedia.org/wiki/Honkai:_Star_Rail')
  })
})
