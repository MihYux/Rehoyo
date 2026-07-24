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
  it('starts a shared headless runtime before any candidate and forwards a packaged executable path', async () => {
    const context = { newPage: vi.fn(), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const browserType = { launch: vi.fn(async () => browser) }
    const researchBrowser = createHeadlessResearchBrowser({
      browserType,
      executablePath: 'C:\\Program Files\\ReHoYo\\resources\\playwright-browsers\\chromium.exe',
    })

    await expect(researchBrowser.start({ runId: 'run-start', agentId: 'research' })).resolves.toEqual({ status: 'ready' })

    expect(browserType.launch).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      executablePath: 'C:\\Program Files\\ReHoYo\\resources\\playwright-browsers\\chromium.exe',
    }))
    expect(browser.newContext).toHaveBeenCalledOnce()
    expect(context.newPage).not.toHaveBeenCalled()
    await researchBrowser.close()
  })

  it('closes idempotently and waits for an in-progress close before restarting', async () => {
    let releaseContextClose!: () => void
    const contextClose = new Promise<void>((resolve) => { releaseContextClose = resolve })
    const contexts = [
      { newPage: vi.fn(), route: vi.fn(async () => undefined), close: vi.fn(() => contextClose) },
      { newPage: vi.fn(), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) },
    ]
    const browserType = {
      launch: vi.fn(async () => ({ newContext: vi.fn(async () => contexts.shift()), close: vi.fn(async () => undefined) })),
    }
    const researchBrowser = createHeadlessResearchBrowser({ browserType })
    await researchBrowser.start()

    const firstClose = researchBrowser.close()
    const duplicateClose = researchBrowser.close()
    const restart = researchBrowser.start()
    releaseContextClose()
    await Promise.all([firstClose, duplicateClose])
    await expect(restart).resolves.toEqual({ status: 'ready' })

    expect(browserType.launch).toHaveBeenCalledTimes(2)
    await researchBrowser.close()
  })

  it('reports and rejects fatal launch, context, and page creation failures', async () => {
    const launchObservations: Array<{ status: string; action?: string; fatal?: boolean; error?: string }> = []
    const launchFailure = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => { throw new Error('chromium missing') }) },
      onObservation: (observation) => launchObservations.push(observation),
    })

    await expect(launchFailure.start({ runId: 'run-fatal', agentId: 'research' })).rejects.toThrow('chromium missing')
    expect(launchObservations).toContainEqual(expect.objectContaining({
      action: 'start', status: 'failed', fatal: true, error: expect.stringContaining('chromium missing'),
    }))

    const contextObservations: typeof launchObservations = []
    const contextFailure = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => ({
        newContext: vi.fn(async () => { throw new Error('context refused') }),
        close: vi.fn(async () => undefined),
      })) },
      onObservation: (observation) => contextObservations.push(observation),
    })
    await expect(contextFailure.start()).rejects.toThrow('context refused')
    expect(contextObservations).toContainEqual(expect.objectContaining({ action: 'start', status: 'failed', fatal: true }))

    const pageObservations: typeof launchObservations = []
    const pageFailure = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => ({
        newContext: vi.fn(async () => ({
          route: vi.fn(async () => undefined),
          newPage: vi.fn(async () => { throw new Error('page refused') }),
          close: vi.fn(async () => undefined),
        })),
        close: vi.fn(async () => undefined),
      })) },
      onObservation: (observation) => pageObservations.push(observation),
    })
    await pageFailure.start()
    await expect(pageFailure.open({
      id: 'fatal-page', url: 'https://example.com/thread', role: 'player', source: 'Example', region: 'WEST', language: 'en-US',
    })).rejects.toThrow('page refused')
    expect(pageObservations).toContainEqual(expect.objectContaining({ action: 'open', status: 'failed', fatal: true }))
    await pageFailure.close()
  })

  it('closes and releases a failed navigation page without shutting down healthy pages', async () => {
    const failedPage = {
      goto: vi.fn(async () => { throw new Error('navigation failed') }),
      screenshot: vi.fn(async () => Buffer.from('failed-preview')),
      close: vi.fn(async () => undefined),
    }
    const healthyPage = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'Healthy discussion'),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => 'A real player opinion remains available after the failed page.') })),
      screenshot: vi.fn(async () => Buffer.from('healthy-preview')),
      close: vi.fn(async () => undefined),
    }
    const pageQueue = [failedPage, healthyPage]
    const context = { newPage: vi.fn(async () => pageQueue.shift()), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const researchBrowser = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => browser) },
      maxPagesPerRegion: 1,
    })

    await expect(researchBrowser.open({
      id: 'failed', url: 'https://failed.example.com/thread', role: 'player', source: 'Example', region: 'WEST', language: 'en-US',
    })).rejects.toThrow('navigation failed')
    const healthy = await researchBrowser.open({
      id: 'healthy', url: 'https://healthy.example.com/thread', role: 'player', source: 'Example', region: 'WEST', language: 'en-US',
    })

    expect(failedPage.close).toHaveBeenCalledOnce()
    expect(healthy.status).toBe('completed')
    expect(browser.close).not.toHaveBeenCalled()
    await researchBrowser.close()
  })

  it('never swallows a fatal startup error from the legacy batch observer', async () => {
    const researchBrowser = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => { throw new Error('browser boot failed') }) },
    })

    await expect(researchBrowser.observe([
      { id: 'page', url: 'https://example.com/thread', role: 'player', source: 'Example', region: 'WEST', language: 'en-US' },
    ])).rejects.toThrow('browser boot failed')
  })

  it('enforces four active pages per region and twelve active pages globally', async () => {
    const makePage = () => ({
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'Player discussion'),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => 'A sufficiently long visible player opinion about this update.') })),
      screenshot: vi.fn(async () => Buffer.from('preview')),
      close: vi.fn(async () => undefined),
    })
    const context = { newPage: vi.fn(async () => makePage()), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const researchBrowser = createHeadlessResearchBrowser({ browserType: { launch: vi.fn(async () => browser) } })
    await researchBrowser.start()

    const openFor = (region: string, index: number) => researchBrowser.open({
      id: `${region}-${index}`, url: `https://${region.toLowerCase()}-${index}.example.com/thread`, role: 'player', source: 'Example', region, language: 'en-US',
    })
    const opened = []
    for (const region of ['CN', 'JP', 'WEST']) {
      for (let index = 0; index < 4; index += 1) opened.push(await openFor(region, index))
    }

    await expect(openFor('CN', 5)).rejects.toThrow(/4-page regional/i)
    await expect(openFor('GLOBAL', 1)).rejects.toThrow(/12-page global/i)
    expect(opened).toHaveLength(12)
    expect(context.newPage).toHaveBeenCalledTimes(12)
    await researchBrowser.close()
  })

  it('observes one candidate without closing the shared runtime and emits screenshots for every action', async () => {
    const page = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'HSR player thread'),
      locator: vi.fn((selector: string) => selector === 'body' ? {
        innerText: vi.fn(async () => 'Black Swan feels excellent, while the story pacing remains divisive.'),
      } : {
        allInnerTexts: vi.fn(async () => ['Black Swan feels excellent.', 'The story pacing remains divisive.']),
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
    await researchBrowser.start({ runId: 'candidate-run', agentId: 'research' })

    const result = await researchBrowser.observeCandidate({
      id: 'candidate', url: 'https://example.com/thread', role: 'player', source: 'Example', region: 'WEST', language: 'en-US',
    }, { runId: 'candidate-run', agentId: 'research', selectors: ['.comment'] })
    await researchBrowser.click(result.pageId, '.expand')
    await researchBrowser.type(result.pageId, '.reply', 'manual verification input')

    expect(result).toEqual(expect.objectContaining({
      pageId: expect.any(String), status: 'completed', text: expect.stringContaining('Black Swan'), comments: expect.arrayContaining(['Black Swan feels excellent.']),
    }))
    expect(page.close).not.toHaveBeenCalled()
    expect(browser.close).not.toHaveBeenCalled()
    for (const action of ['open', 'scroll', 'extract_comments', 'click', 'type']) {
      expect(observations.some((item) => item.action === action && item.screenshotDataUrl?.startsWith('data:image/jpeg'))).toBe(true)
    }
    await researchBrowser.closePage(result.pageId)
    expect(browser.close).not.toHaveBeenCalled()
    await researchBrowser.close()
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('releases only the candidate page when a post-open browser action fails', async () => {
    const failingPage = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'Initially readable thread'),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => 'A visible player opinion before scrolling fails.') })),
      evaluate: vi.fn(async () => { throw new Error('scroll failed') }),
      screenshot: vi.fn(async () => Buffer.from('preview')),
      close: vi.fn(async () => undefined),
    }
    const replacementPage = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => 'Replacement thread'),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => 'Another visible player opinion can still be opened.') })),
      screenshot: vi.fn(async () => Buffer.from('preview')),
      close: vi.fn(async () => undefined),
    }
    const pageQueue = [failingPage, replacementPage]
    const context = { newPage: vi.fn(async () => pageQueue.shift()), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const researchBrowser = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => browser) },
      maxPagesPerRegion: 1,
    })

    await expect(researchBrowser.observeCandidate({
      id: 'failed-action', url: 'https://failed-action.example.com/thread', role: 'player', source: 'Example', region: 'JP', language: 'ja-JP',
    })).rejects.toThrow('scroll failed')
    const replacement = await researchBrowser.open({
      id: 'replacement', url: 'https://replacement.example.com/thread', role: 'player', source: 'Example', region: 'JP', language: 'ja-JP',
    })

    expect(failingPage.close).toHaveBeenCalledOnce()
    expect(replacement.status).toBe('completed')
    expect(browser.close).not.toHaveBeenCalled()
    await researchBrowser.close()
  })

  it('pauses on a challenge and automatically continues after manual takeover succeeds', async () => {
    let challengeActive = true
    const page = {
      goto: vi.fn(async () => ({ status: () => 200 })),
      title: vi.fn(async () => challengeActive ? 'Verify you are human' : 'Player discussion'),
      locator: vi.fn((selector: string) => selector === 'body' ? {
        innerText: vi.fn(async () => challengeActive ? 'Turnstile security check' : 'This player likes Penacony but dislikes the pacing.'),
      } : {
        allInnerTexts: vi.fn(async () => challengeActive ? [] : ['This player likes Penacony but dislikes the pacing.']),
      }),
      screenshot: vi.fn(async () => Buffer.from('challenge-preview')),
      click: vi.fn(async () => { challengeActive = false }),
      fill: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }
    const context = { newPage: vi.fn(async () => page), route: vi.fn(async () => undefined), close: vi.fn(async () => undefined) }
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) }
    const observations: Array<{ action?: string; status: string }> = []
    const researchBrowser = createHeadlessResearchBrowser({
      browserType: { launch: vi.fn(async () => browser) },
      onObservation: (observation) => observations.push(observation),
    })

    const opened = await researchBrowser.open({
      id: 'challenge', url: 'https://example.com/challenge', role: 'player', source: 'Example', region: 'WEST', language: 'en-US',
    })
    expect(opened.status).toBe('challenge_waiting')
    await researchBrowser.click(opened.pageId, '#turnstile-checkbox')
    const resumed = await researchBrowser.resume(opened.pageId, { timeoutMs: 50, pollIntervalMs: 1 })

    expect(resumed).toEqual(expect.objectContaining({ status: 'completed', text: expect.stringContaining('Penacony') }))
    expect(await researchBrowser.check(opened.pageId)).toEqual(expect.objectContaining({ status: 'completed' }))
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'challenge_waiting' }),
      expect.objectContaining({ action: 'resume', status: 'completed' }),
    ]))
    await researchBrowser.close()
  })

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
