import { isIP } from 'node:net'
import { chromium } from 'playwright'

const CHALLENGE_PATTERN = /captcha|turnstile|cf-chl|just\s+a\s+moment|verify\s+(?:that\s+)?you\s+are\s+human|security\s+check|人机验证|验证您是真人|安全验证/i

function clean(value, limit = 60_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] === 0
}

function isPrivateIpv6(hostname) {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
}

export function validatePublicHttpsUrl(value) {
  let url
  try {
    url = new URL(String(value ?? ''))
  } catch {
    throw new Error('浏览目标必须是有效的 HTTPS URL。')
  }
  if (url.protocol !== 'https:') throw new Error('浏览目标必须使用 HTTPS。')
  if (url.username || url.password) throw new Error('浏览目标必须是 public URL，不能包含认证信息。')
  const hostname = url.hostname.toLowerCase()
  const localName = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
  const addressType = isIP(hostname.replace(/^\[|\]$/g, ''))
  if (localName || (addressType === 4 && isPrivateIpv4(hostname)) || (addressType === 6 && isPrivateIpv6(hostname))) {
    throw new Error('浏览目标必须是 public HTTPS URL。')
  }
  return url.href
}

export class ResearchBrowserFatalError extends Error {
  constructor(stage, cause) {
    const detail = clean(cause instanceof Error ? cause.message : cause, 300) || 'Unknown browser runtime error.'
    super(`Research browser ${stage} failed: ${detail}`)
    this.name = 'ResearchBrowserFatalError'
    this.stage = stage
    this.fatal = true
    this.cause = cause
  }
}

export function createHeadlessResearchBrowser({
  browserType = chromium,
  onObservation = () => {},
  maxConcurrency,
  maxPagesGlobal = maxConcurrency ?? 12,
  maxPagesPerRegion = 4,
  navigationTimeoutMs = 30_000,
  executablePath,
  launchOptions = {},
} = {}) {
  const globalLimit = Math.max(1, Math.min(12, Math.floor(Number(maxPagesGlobal) || 12)))
  const regionalLimit = Math.max(1, Math.min(4, globalLimit, Math.floor(Number(maxPagesPerRegion) || 4)))
  let browser
  let context
  let startPromise
  let closePromise
  let pageCounter = 0
  let activeSlots = 0
  let runtimeIdentity = { runId: 'research', agentId: 'research' }
  const pages = new Map()
  const regionalSlots = new Map()

  function safeObserve(observation) {
    try {
      onObservation(observation)
    } catch {
      // UI observation failures must not alter browser control flow.
    }
  }

  function runtimeObservation(payload, target = {}) {
    safeObserve({
      runId: runtimeIdentity.runId,
      agentId: runtimeIdentity.agentId,
      id: target.id || 'browser-runtime',
      url: target.url || '',
      source: target.source || 'Playwright',
      role: target.role || 'context',
      region: target.region || 'GLOBAL',
      language: target.language || 'system',
      ...payload,
    })
  }

  function fatalError(stage, cause, target) {
    const error = cause instanceof ResearchBrowserFatalError ? cause : new ResearchBrowserFatalError(stage, cause)
    runtimeObservation({ action: stage === 'start' ? 'start' : 'open', status: 'failed', fatal: true, error: clean(error.message, 300) }, target)
    return error
  }

  function normalizeRegion(region) {
    return clean(region || 'GLOBAL', 40).toUpperCase() || 'GLOBAL'
  }

  function reserveSlot(region) {
    const key = normalizeRegion(region)
    const regionCount = regionalSlots.get(key) || 0
    if (regionCount >= regionalLimit) {
      throw new Error(`Research browser reached its ${regionalLimit}-page regional limit for ${key}.`)
    }
    if (activeSlots >= globalLimit) {
      throw new Error(`Research browser reached its ${globalLimit}-page global limit.`)
    }
    activeSlots += 1
    regionalSlots.set(key, regionCount + 1)
    return key
  }

  function releaseSlot(region) {
    if (!region) return
    const count = regionalSlots.get(region) || 0
    if (count <= 1) regionalSlots.delete(region)
    else regionalSlots.set(region, count - 1)
    activeSlots = Math.max(0, activeSlots - 1)
  }

  async function start(identity = {}) {
    runtimeIdentity = {
      runId: clean(identity.runId || runtimeIdentity.runId, 160) || 'research',
      agentId: clean(identity.agentId || runtimeIdentity.agentId, 80) || 'research',
    }
    if (closePromise) await closePromise
    if (context) return { status: 'ready' }
    if (startPromise) return startPromise

    startPromise = (async () => {
      let launchedBrowser
      let launchedContext
      try {
        const configuredExecutable = clean(executablePath, 2_000)
        launchedBrowser = await browserType.launch({
          ...launchOptions,
          headless: true,
          ...(configuredExecutable ? { executablePath: configuredExecutable } : {}),
        })
        launchedContext = await launchedBrowser.newContext({
          viewport: { width: 1365, height: 768 },
          serviceWorkers: 'block',
          acceptDownloads: false,
          locale: 'zh-CN',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 ReHoYoResearch/1.0',
        })
        if (typeof launchedContext.route === 'function') {
          await launchedContext.route('**/*', async (route) => {
            const resourceType = route.request().resourceType()
            if (['media', 'font'].includes(resourceType)) await route.abort()
            else await route.continue()
          })
        }
        browser = launchedBrowser
        context = launchedContext
        return { status: 'ready' }
      } catch (cause) {
        await launchedContext?.close?.().catch(() => undefined)
        await launchedBrowser?.close?.().catch(() => undefined)
        if (context === launchedContext) context = undefined
        if (browser === launchedBrowser) browser = undefined
        throw fatalError('start', cause)
      } finally {
        startPromise = undefined
      }
    })()
    return startPromise
  }

  function entryFor(pageId) {
    const entry = pages.get(String(pageId || ''))
    if (!entry) throw new Error('Research browser page is not active.')
    return entry
  }

  async function screenshot(pageId) {
    const { page } = entryFor(pageId)
    if (typeof page.screenshot !== 'function') return ''
    const bytes = await page.screenshot({ type: 'jpeg', quality: 58, fullPage: false })
    return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`
  }

  async function emitPage(entry, payload) {
    let screenshotDataUrl = ''
    try {
      screenshotDataUrl = await screenshot(entry.pageId)
    } catch {
      // A preview failure must not discard verified page text.
    }
    safeObserve({
      runId: entry.runId,
      agentId: entry.agentId,
      id: entry.target.id,
      pageId: entry.pageId,
      url: entry.target.url,
      source: entry.target.source,
      role: entry.target.role,
      region: entry.target.region,
      language: entry.target.language,
      screenshotDataUrl,
      ...payload,
    })
  }

  async function open(target, { runId = 'research', agentId = 'research' } = {}) {
    const safeTarget = { ...target, url: validatePublicHttpsUrl(target?.url) }
    await start({ runId, agentId })
    const slotRegion = reserveSlot(safeTarget.region)
    let page
    try {
      page = await context.newPage()
    } catch (cause) {
      releaseSlot(slotRegion)
      throw fatalError('page', cause, safeTarget)
    }
    const pageId = `${agentId}-${++pageCounter}`
    const entry = { pageId, page, target: safeTarget, runId, agentId, status: 'navigating', slotRegion }
    pages.set(pageId, entry)
    safeObserve({ runId, agentId, id: safeTarget.id, pageId, url: safeTarget.url, source: safeTarget.source, role: safeTarget.role, region: safeTarget.region, language: safeTarget.language, action: 'open', status: 'navigating' })
    try {
      const response = await page.goto(safeTarget.url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs })
      const title = clean(await page.title(), 500)
      const text = clean(await page.locator('body').innerText({ timeout: Math.min(navigationTimeoutMs, 12_000) }))
      const statusCode = typeof response?.status === 'function' ? response.status() : undefined
      entry.title = title
      entry.text = text
      entry.statusCode = statusCode
      if (CHALLENGE_PATTERN.test(`${title} ${text.slice(0, 2_000)}`)) {
        entry.status = 'challenge_waiting'
        await emitPage(entry, { action: 'open', title, status: 'challenge_waiting', statusCode })
        return { pageId, title, text, status: entry.status, statusCode }
      }
      if (!text) throw new Error('页面没有可提取的可见文本。')
      entry.status = 'completed'
      await emitPage(entry, { action: 'open', title, textPreview: text.slice(0, 220), status: 'completed', statusCode })
      return { pageId, title, text, status: entry.status, statusCode }
    } catch (error) {
      entry.status = 'failed'
      await emitPage(entry, { action: 'open', status: 'failed', error: clean(error instanceof Error ? error.message : error, 240) })
      await closePage(pageId)
      throw error
    }
  }

  async function scroll(pageId, { direction = 'down', amount = 900 } = {}) {
    const entry = entryFor(pageId)
    const distance = Math.max(200, Math.min(4_000, Math.floor(Number(amount) || 900))) * (direction === 'up' ? -1 : 1)
    await entry.page.evaluate((value) => window.scrollBy(0, value), distance)
    await emitPage(entry, { action: 'scroll', status: entry.status, title: entry.title })
  }

  async function readPage(entry) {
    const title = clean(await entry.page.title(), 500)
    const text = clean(await entry.page.locator('body').innerText({ timeout: Math.min(navigationTimeoutMs, 12_000) }))
    entry.title = title
    entry.text = text
    return { title, text }
  }

  async function check(pageId, { action = 'check' } = {}) {
    const entry = entryFor(pageId)
    const { title, text } = await readPage(entry)
    const challenge = CHALLENGE_PATTERN.test(`${title} ${text.slice(0, 2_000)}`)
    entry.status = challenge ? 'challenge_waiting' : text ? 'completed' : entry.status
    await emitPage(entry, {
      action,
      title,
      textPreview: text.slice(0, 220),
      status: entry.status,
      statusCode: entry.statusCode,
    })
    return { pageId, title, text, status: entry.status, statusCode: entry.statusCode }
  }

  async function click(pageId, selectorOrPoint) {
    const entry = entryFor(pageId)
    if (selectorOrPoint && typeof selectorOrPoint === 'object') {
      const x = Number(selectorOrPoint.x)
      const y = Number(selectorOrPoint.y)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !entry.page.mouse?.click) throw new Error('Manual browser click requires valid page coordinates.')
      await entry.page.mouse.click(x, y)
    } else {
      await entry.page.click(clean(selectorOrPoint, 500), { timeout: Math.min(navigationTimeoutMs, 12_000) })
    }
    if (entry.status === 'challenge_waiting') return check(pageId, { action: 'click' })
    await emitPage(entry, { action: 'click', status: entry.status, title: entry.title })
    return { pageId, status: entry.status }
  }

  async function type(pageId, selector, value) {
    const entry = entryFor(pageId)
    await entry.page.fill(clean(selector, 500), clean(value, 2_000))
    if (entry.status === 'challenge_waiting') return check(pageId, { action: 'type' })
    await emitPage(entry, { action: 'type', status: entry.status, title: entry.title })
    return { pageId, status: entry.status }
  }

  async function extractVisibleComments(pageId, { selectors = [] } = {}) {
    const entry = entryFor(pageId)
    const candidates = [...new Set([...selectors, '[data-testid="comment"]', '.comment', '.reply', 'article'])].slice(0, 12)
    const comments = []
    for (const selector of candidates) {
      try {
        const values = await entry.page.locator(selector).allInnerTexts()
        for (const value of values) {
          const normalized = clean(value, 2_000)
          if (normalized.length >= 12 && !comments.includes(normalized)) comments.push(normalized)
        }
      } catch {
        // Unsupported selectors are expected across heterogeneous public sites.
      }
      if (comments.length >= 80) break
    }
    await emitPage(entry, { action: 'extract_comments', status: entry.status, title: entry.title, textPreview: comments.slice(0, 2).join(' · ').slice(0, 220) })
    return comments.slice(0, 80)
  }

  async function resume(pageId, { timeoutMs = 30_000, pollIntervalMs = 500 } = {}) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0)
    const interval = Math.max(1, Math.min(2_000, Number(pollIntervalMs) || 500))
    let state
    do {
      state = await check(pageId, { action: 'resume' })
      if (state.status !== 'challenge_waiting') return state
      if (Date.now() >= deadline) return state
      const entry = entryFor(pageId)
      if (typeof entry.page.waitForTimeout === 'function') await entry.page.waitForTimeout(interval)
      else await new Promise((resolve) => setTimeout(resolve, interval))
    } while (Date.now() <= deadline)
    return state
  }

  async function observeCandidate(target, { runId = runtimeIdentity.runId, agentId = runtimeIdentity.agentId, selectors = [], scrollAmount = 1_200 } = {}) {
    await start({ runId, agentId })
    const opened = await open(target, { runId, agentId })
    try {
      if (opened.status === 'challenge_waiting') {
        return { ...target, ...opened, comments: [], retrievedAt: new Date().toISOString() }
      }
      await scroll(opened.pageId, { direction: 'down', amount: scrollAmount })
      const entry = entryFor(opened.pageId)
      await readPage(entry)
      const comments = await extractVisibleComments(opened.pageId, { selectors })
      return {
        ...target,
        pageId: opened.pageId,
        title: entry.title || target.title || target.source,
        text: entry.text,
        status: entry.status,
        statusCode: entry.statusCode,
        comments,
        retrievedAt: new Date().toISOString(),
      }
    } catch (error) {
      await closePage(opened.pageId)
      throw error
    }
  }

  async function closePage(pageId) {
    const key = String(pageId || '')
    const entry = pages.get(key)
    if (!entry) return
    pages.delete(key)
    releaseSlot(entry.slotRegion)
    await entry.page.close?.().catch(() => undefined)
  }

  async function close() {
    if (closePromise) return closePromise
    closePromise = (async () => {
      if (startPromise) await startPromise.catch(() => undefined)
      await Promise.all([...pages.keys()].map(closePage))
      const activeContext = context
      const activeBrowser = browser
      context = undefined
      browser = undefined
      await activeContext?.close?.().catch(() => undefined)
      await activeBrowser?.close?.().catch(() => undefined)
      activeSlots = 0
      regionalSlots.clear()
    })().finally(() => {
      closePromise = undefined
    })
    return closePromise
  }

  async function observe(targets, { runId = 'research', agentId = 'research' } = {}) {
    const safeTargets = (Array.isArray(targets) ? targets : []).map((target) => ({
      ...target,
      url: validatePublicHttpsUrl(target?.url),
    }))
    if (!safeTargets.length) return []

    try {
      await start({ runId, agentId })
      const documents = []
      let cursor = 0
      const workers = Array.from({ length: Math.min(regionalLimit, globalLimit, safeTargets.length) }, async () => {
        while (cursor < safeTargets.length) {
          const target = safeTargets[cursor]
          cursor += 1
          let observed
          try {
            observed = await observeCandidate(target, { runId, agentId })
            if (observed.status === 'challenge_waiting') continue
            documents.push({
              ...target,
              title: observed.title || target.title || target.source,
              text: observed.text,
              retrievedAt: observed.retrievedAt,
            })
          } catch (error) {
            if (error?.fatal === true) throw error
            // Page navigation failures are observable and isolated to this target.
          } finally {
            if (observed?.pageId) await closePage(observed.pageId)
          }
        }
      })
      await Promise.all(workers)
      return documents
    } finally {
      await close()
    }
  }

  return Object.freeze({
    start,
    open,
    scroll,
    click,
    manualClick: click,
    type,
    manualType: type,
    check,
    checkChallenge: check,
    resume,
    resumeChallenge: resume,
    extractVisibleComments,
    screenshot,
    observeCandidate,
    closePage,
    close,
    observe,
  })
}
