import { isIP } from 'node:net'
import { chromium } from 'playwright'

const CHALLENGE_PATTERN = /captcha|turnstile|verify\s+(?:that\s+)?you\s+are\s+human|security\s+check|人机验证|验证您是真人|安全验证/i

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

export function createHeadlessResearchBrowser({
  browserType = chromium,
  onObservation = () => {},
  maxConcurrency = 4,
  navigationTimeoutMs = 30_000,
} = {}) {
  const concurrency = Math.max(1, Math.min(12, Math.floor(maxConcurrency)))
  let browser
  let context
  let pageCounter = 0
  const pages = new Map()

  async function ensureContext() {
    if (context) return context
    browser = await browserType.launch({ headless: true })
    context = await browser.newContext({
      viewport: { width: 1365, height: 768 },
      serviceWorkers: 'block',
      acceptDownloads: false,
      locale: 'zh-CN',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 ReHoYoResearch/1.0',
    })
    await context.route('**/*', async (route) => {
      const resourceType = route.request().resourceType()
      if (['media', 'font'].includes(resourceType)) await route.abort()
      else await route.continue()
    })
    return context
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
    onObservation({
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
    if (pages.size >= concurrency) throw new Error(`Research browser reached its ${concurrency}-page concurrency limit.`)
    const safeTarget = { ...target, url: validatePublicHttpsUrl(target?.url) }
    const activeContext = await ensureContext()
    const page = await activeContext.newPage()
    const pageId = `${agentId}-${++pageCounter}`
    const entry = { pageId, page, target: safeTarget, runId, agentId, status: 'navigating' }
    pages.set(pageId, entry)
    onObservation({ runId, agentId, id: safeTarget.id, pageId, url: safeTarget.url, source: safeTarget.source, role: safeTarget.role, region: safeTarget.region, language: safeTarget.language, action: 'open', status: 'navigating' })
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
      throw error
    }
  }

  async function scroll(pageId, { direction = 'down', amount = 900 } = {}) {
    const entry = entryFor(pageId)
    const distance = Math.max(200, Math.min(4_000, Math.floor(Number(amount) || 900))) * (direction === 'up' ? -1 : 1)
    await entry.page.evaluate((value) => window.scrollBy(0, value), distance)
    await emitPage(entry, { action: 'scroll', status: entry.status, title: entry.title })
  }

  async function click(pageId, selector) {
    const entry = entryFor(pageId)
    await entry.page.click(clean(selector, 500), { timeout: Math.min(navigationTimeoutMs, 12_000) })
    await emitPage(entry, { action: 'click', status: entry.status, title: entry.title })
  }

  async function type(pageId, selector, value) {
    const entry = entryFor(pageId)
    await entry.page.fill(clean(selector, 500), clean(value, 2_000))
    await emitPage(entry, { action: 'type', status: entry.status, title: entry.title })
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

  async function closePage(pageId) {
    const entry = pages.get(pageId)
    if (!entry) return
    pages.delete(pageId)
    await entry.page.close().catch(() => undefined)
  }

  async function close() {
    await Promise.all([...pages.keys()].map(closePage))
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    context = undefined
    browser = undefined
  }

  async function observe(targets, { runId = 'research', agentId = 'research' } = {}) {
    const safeTargets = (Array.isArray(targets) ? targets : []).map((target) => ({
      ...target,
      url: validatePublicHttpsUrl(target?.url),
    }))
    if (!safeTargets.length) return []

    try {
      const documents = []
      let cursor = 0
      const workers = Array.from({ length: Math.min(concurrency, safeTargets.length) }, async () => {
        while (cursor < safeTargets.length) {
          const target = safeTargets[cursor]
          cursor += 1
          let opened
          try {
            opened = await open(target, { runId, agentId })
            if (opened.status === 'challenge_waiting') continue
            await scroll(opened.pageId, { direction: 'down', amount: 1200 }).catch(() => undefined)
            documents.push({
              ...target,
              title: opened.title || target.title || target.source,
              text: opened.text,
              retrievedAt: new Date().toISOString(),
            })
          } catch (error) {
            // open() already emits a redacted failure observation.
          } finally {
            if (opened?.pageId) await closePage(opened.pageId)
          }
        }
      })
      await Promise.all(workers)
      return documents
    } finally {
      await close()
    }
  }

  return Object.freeze({ open, scroll, click, type, extractVisibleComments, screenshot, closePage, close, observe })
}
