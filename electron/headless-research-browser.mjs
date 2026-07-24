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

  async function observe(targets, { runId = 'research', agentId = 'research' } = {}) {
    const safeTargets = (Array.isArray(targets) ? targets : []).map((target) => ({
      ...target,
      url: validatePublicHttpsUrl(target?.url),
    }))
    if (!safeTargets.length) return []

    const browser = await browserType.launch({ headless: true })
    let context
    try {
      context = await browser.newContext({
        viewport: { width: 1365, height: 768 },
        serviceWorkers: 'block',
        acceptDownloads: false,
        locale: 'zh-CN',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 ReHoYoResearch/1.0',
      })
      await context.route('**/*', async (route) => {
        const resourceType = route.request().resourceType()
        if (['image', 'media', 'font'].includes(resourceType)) await route.abort()
        else await route.continue()
      })

      const documents = []
      let cursor = 0
      const workers = Array.from({ length: Math.min(concurrency, safeTargets.length) }, async () => {
        while (cursor < safeTargets.length) {
          const target = safeTargets[cursor]
          cursor += 1
          onObservation({ runId, agentId, id: target.id, url: target.url, source: target.source, role: target.role, region: target.region, language: target.language, status: 'navigating' })
          const page = await context.newPage()
          try {
            const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs })
            await page.evaluate(() => window.scrollTo(0, Math.min(document.body.scrollHeight, 1200))).catch(() => undefined)
            const title = clean(await page.title(), 500)
            const text = clean(await page.locator('body').innerText({ timeout: Math.min(navigationTimeoutMs, 12_000) }))
            const statusCode = typeof response?.status === 'function' ? response.status() : undefined
            if (CHALLENGE_PATTERN.test(`${title} ${text.slice(0, 2_000)}`)) {
              onObservation({ runId, agentId, id: target.id, url: target.url, source: target.source, role: target.role, region: target.region, language: target.language, title, status: 'challenge_waiting', statusCode })
              continue
            }
            if (!text) throw new Error('页面没有可提取的可见文本。')
            documents.push({
              ...target,
              title: title || target.title || target.source,
              text,
              retrievedAt: new Date().toISOString(),
            })
            onObservation({ runId, agentId, id: target.id, url: target.url, source: target.source, role: target.role, region: target.region, language: target.language, title, textPreview: text.slice(0, 220), status: 'completed', statusCode })
          } catch (error) {
            onObservation({
              runId,
              agentId,
              id: target.id,
              url: target.url,
              source: target.source,
              role: target.role,
              region: target.region,
              language: target.language,
              status: 'failed',
              error: clean(error instanceof Error ? error.message : error, 240),
            })
          } finally {
            await page.close().catch(() => undefined)
          }
        }
      })
      await Promise.all(workers)
      return documents
    } finally {
      await context?.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    }
  }

  return Object.freeze({ observe })
}
