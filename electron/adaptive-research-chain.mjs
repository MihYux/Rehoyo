import { createHash } from 'node:crypto'
import { createAdaptiveSearchRouter } from './adaptive-search-router.mjs'

const SUPPORTED_REGIONS = Object.freeze(['CN', 'JP', 'WEST'])

function clean(value, limit = 60_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function normalizeText(value) {
  return clean(value).normalize('NFKC').toLocaleLowerCase()
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:') return ''
    url.hash = ''
    return url.href
  } catch {
    return ''
  }
}

function domainFor(url) {
  try {
    return new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sourceTypeFor(url) {
  const hostname = domainFor(url)
  if (/youtube|youtu\.be|bilibili|nicovideo/.test(hostname)) return 'video'
  if (/reddit|hoyolab|miyoushe|tieba|forum|gamefaqs|steamcommunity/.test(hostname)) return 'community'
  return 'forum'
}

function providerForAuthentication(error, route) {
  const status = Number(error?.status || 0)
  if (status !== 401 && status !== 403) return ''
  if (error?.provider === 'openai' || route === 'openai_search') return 'openai'
  if (error?.provider === 'bigmodel' || route === 'bigmodel_search') return 'bigmodel'
  return ''
}

function routeFailure(error) {
  const message = clean(error instanceof Error ? error.message : error, 300)
  const status = Number(error?.status || 0)
  const errorType = error?.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message) ? 'timeout' : 'request'
  return { httpStatus: status, errorType, error: message }
}

function createEvidenceId(runId, region, url, original, sequence) {
  const digest = createHash('sha256').update(`${url}\n${normalizeText(original)}`).digest('hex').slice(0, 12)
  return `${clean(runId, 80)}-${region.toLocaleLowerCase()}-${String(sequence).padStart(3, '0')}-${digest}`
}

function normalizeCandidate(candidate, route, region, index) {
  const url = httpsUrl(candidate?.url)
  if (!url) return null
  return {
    id: clean(candidate?.id, 160) || `${region.toLocaleLowerCase()}-${route}-${index + 1}`,
    title: clean(candidate?.title, 500) || domainFor(url),
    source: clean(candidate?.source, 160) || domainFor(url),
    url,
    provider: route,
    region,
  }
}

function quotaSnapshot(regions, evidence, uniqueDomains, evidencePerRegion, globalDomainTarget) {
  const regional = Object.fromEntries(SUPPORTED_REGIONS.map((region) => {
    const requested = regions.includes(region)
    const count = evidence.filter((item) => item.region === region).length
    return [region, {
      evidence: count,
      target: requested ? evidencePerRegion : 0,
      reached: !requested || count >= evidencePerRegion,
    }]
  }))
  const regionsReached = regions.every((region) => regional[region].reached)
  return {
    regions: regional,
    totalEvidence: evidence.length,
    targetEvidence: evidencePerRegion * regions.length,
    uniqueDomains: uniqueDomains.size,
    targetDomains: globalDomainTarget,
    regionsReached,
    domainsReached: uniqueDomains.size >= globalDomainTarget,
    targetReached: regionsReached && uniqueDomains.size >= globalDomainTarget,
  }
}

function safeHistoryCall(historyStore, method, ...args) {
  if (typeof historyStore?.[method] !== 'function') return
  try {
    historyStore[method](...args)
  } catch (error) {
    if (!/duplicate|unique constraint/i.test(String(error?.message || error))) throw error
  }
}

export async function runAdaptiveResearchChain({
  runId,
  request,
  regions: regionInput = SUPPORTED_REGIONS,
  evidencePerRegion = 30,
  globalDomainTarget = 30,
  maxAttemptsPerRegion = 160,
  maxRunMinutes = 45,
  router = createAdaptiveSearchRouter({ runId }),
  browser,
  planner,
  providers,
  judgePage,
  fetchSupplement,
  historyStore,
  waitForReauthentication,
  onEvent = () => {},
  now = Date.now,
  signal,
}) {
  const regions = [...new Set((Array.isArray(regionInput) ? regionInput : []).filter((region) => SUPPORTED_REGIONS.includes(region)))]
  if (!clean(runId, 160) || !regions.length) throw new Error('Adaptive research requires a run id and at least one supported region.')
  if (!browser || typeof browser.start !== 'function') throw new Error('Adaptive research requires a shared Playwright browser runtime.')
  if (!planner || typeof planner.nextAction !== 'function') throw new Error('Adaptive research requires a dynamic Agent planner.')
  if (!providers || typeof judgePage !== 'function') throw new Error('Adaptive research requires discovery providers and BigModel page judgment.')

  const targetPerRegion = Math.max(1, Math.floor(Number(evidencePerRegion) || 30))
  const targetDomains = Math.max(1, Math.floor(Number(globalDomainTarget) || 30))
  const attemptLimit = Math.max(1, Math.floor(Number(maxAttemptsPerRegion) || 160))
  const deadlineAt = now() + Math.max(1, Number(maxRunMinutes) || 45) * 60_000
  const evidenceByKey = new Map()
  const seenCandidates = new Set()
  const uniqueDomains = new Set()
  const attempts = []
  const events = []
  let evidenceSequence = 0
  let auditSequence = 0

  const emit = (type, payload = {}) => {
    const event = { id: `chain-${++auditSequence}`, type, at: now(), ...payload }
    events.push(event)
    onEvent(event)
    return event
  }

  const assertActive = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Research cancelled.', 'AbortError')
    if (now() >= deadlineAt) throw Object.assign(new Error('Adaptive research reached its 45-minute deadline.'), { code: 'RESEARCH_DEADLINE' })
  }

  const processCandidate = async ({ candidate, region, action, route }) => {
    const normalized = normalizeCandidate(candidate, route, region, seenCandidates.size)
    if (!normalized || seenCandidates.has(normalized.url)) return { opened: false, player: false, evidence: [] }
    seenCandidates.add(normalized.url)
    safeHistoryCall(historyStore, 'appendCandidate', runId, {
      ...normalized,
      query: action.query,
      status: 'discovered',
    })
    emit('candidate', { region, route, candidate: normalized })

    let opened
    try {
      assertActive()
      opened = await browser.open(normalized, { runId, agentId: `research-${region.toLocaleLowerCase()}` })
      if (opened?.status === 'challenge_waiting') {
        emit('challenge_waiting', { region, route, pageId: opened.pageId, candidate: normalized })
        if (typeof browser.waitForChallenge === 'function') opened = await browser.waitForChallenge(opened.pageId, { signal })
      }
      if (!opened || opened.status !== 'completed') return { opened: false, player: false, evidence: [] }
      uniqueDomains.add(domainFor(normalized.url))
      await browser.scroll(opened.pageId, { direction: 'down', amount: 1_200 })
      const comments = await browser.extractVisibleComments(opened.pageId, { selectors: [] })
      emit('browser_verified', { region, route, pageId: opened.pageId, candidate: normalized })

      let supplement
      let judgment = await judgePage({
        region,
        request,
        candidate: normalized,
        page: opened,
        comments,
        supplement: undefined,
      })
      emit('bigmodel_judgment', { region, route, pageId: opened.pageId, relevant: judgment?.relevant === true })

      if (judgment?.needsSupplement === true && typeof fetchSupplement === 'function') {
        const fetched = await fetchSupplement({
          region,
          request,
          url: normalized.url,
          candidate: normalized,
          reason: '浏览器可见正文不足，补充同一公开 URL、RSS 或公开 API 正文。',
        })
        if (fetched && httpsUrl(fetched.url) === normalized.url) {
          supplement = clean(fetched.text)
          emit('webfetch_supplement', { region, route, pageId: opened.pageId, url: normalized.url })
          judgment = await judgePage({ region, request, candidate: normalized, page: opened, comments, supplement })
          emit('bigmodel_judgment', { region, route, pageId: opened.pageId, relevant: judgment?.relevant === true, supplemented: true })
        }
      }

      const corpus = normalizeText([opened.text, ...comments, supplement].filter(Boolean).join('\n'))
      const records = []
      if (judgment?.relevant === true && judgment?.containsPlayerExpression === true) {
        for (const expression of Array.isArray(judgment.expressions) ? judgment.expressions : []) {
          const original = clean(expression?.original, 2_000)
          if (original.length < 4 || !corpus.includes(normalizeText(original))) continue
          const key = `${normalized.url}\n${normalizeText(original)}`
          if (evidenceByKey.has(key)) continue
          evidenceSequence += 1
          const record = {
            id: createEvidenceId(runId, region, normalized.url, original, evidenceSequence),
            runId,
            role: 'player',
            source: normalized.source,
            sourceType: sourceTypeFor(normalized.url),
            region,
            language: clean(action.language, 30) || (region === 'CN' ? 'zh-CN' : region === 'JP' ? 'ja-JP' : 'en-US'),
            author: clean(expression?.author, 160) || '公开玩家',
            title: normalized.title,
            url: normalized.url,
            excerptOriginal: original,
            excerptZh: clean(expression?.translatedZh, 2_000) || original,
            sentiment: ['positive', 'neutral', 'negative'].includes(expression?.sentiment) ? expression.sentiment : 'neutral',
            topics: Array.isArray(expression?.topics) ? expression.topics.map((topic) => clean(topic, 80)).filter(Boolean).slice(0, 8) : [],
            confidence: Math.max(0, Math.min(1, Number(expression?.confidence) || 0)),
            engagement: 0,
            publishedLabel: clean(expression?.publishedLabel, 80) || '实时公开页面',
            retrievedAt: new Date(now()).toISOString(),
            synthetic: false,
            contentKind: 'comment',
            discoveryProvider: route,
          }
          evidenceByKey.set(key, record)
          records.push(record)
          safeHistoryCall(historyStore, 'appendEvidence', runId, record)
          emit('evidence', { region, route, evidence: record })
        }
      }
      return { opened: true, player: records.length > 0, evidence: records }
    } finally {
      if (opened?.pageId) await browser.closePage(opened.pageId).catch(() => undefined)
    }
  }

  const processRegion = async (region) => {
    let regionAttempts = 0
    while (regionAttempts < attemptLimit) {
      assertActive()
      const currentEvidence = [...evidenceByKey.values()]
      const quota = quotaSnapshot(regions, currentEvidence, uniqueDomains, targetPerRegion, targetDomains)
      if (quota.regions[region].reached && quota.domainsReached) break

      const action = await planner.nextAction({
        region,
        request,
        quota,
        attempts: attempts.filter((attempt) => attempt.region === region),
        route: router.getSnapshot?.(region),
      })
      if (action?.type === 'finish_region') {
        if (quota.regions[region].reached && quota.domainsReached) break
        emit('finish_rejected', { region, reason: 'quota_not_reached' })
        break
      }
      if (action?.type !== 'search_web') throw new Error(`Dynamic research planner returned unsupported action: ${clean(action?.type, 80) || 'missing'}`)

      const selection = router.select(region)
      const route = selection.route
      const provider = providers[route]
      if (typeof provider !== 'function') throw new Error(`Search provider is unavailable: ${route}`)
      safeHistoryCall(historyStore, 'appendRouteSnapshot', runId, {
        id: `${region.toLocaleLowerCase()}-route-${String(regionAttempts + 1).padStart(4, '0')}`,
        region,
        selectedRoute: route,
        phase: selection.phase,
        revision: selection.revision,
        weights: selection.weights,
        stats: selection.stats,
      })
      emit('route_selected', { region, route, weights: selection.weights, stats: selection.stats, query: action.query })

      let discovery
      try {
        discovery = await provider({ region, route, action, request, attempt: regionAttempts + 1, signal })
      } catch (error) {
        const authProvider = providerForAuthentication(error, route)
        if (authProvider) {
          emit('auth_required', { region, route, provider: authProvider })
          safeHistoryCall(historyStore, 'appendAttempt', runId, {
            id: `${region.toLocaleLowerCase()}-auth-pause-${String(regionAttempts + 1).padStart(4, '0')}`,
            region,
            action: 'auth_pause',
            provider: route,
            status: 'waiting_for_credentials',
          })
          if (typeof waitForReauthentication !== 'function') throw error
          await waitForReauthentication(authProvider, error)
          safeHistoryCall(historyStore, 'appendAttempt', runId, {
            id: `${region.toLocaleLowerCase()}-auth-resume-${String(regionAttempts + 1).padStart(4, '0')}`,
            region,
            action: 'auth_resume',
            provider: route,
            status: 'resumed',
          })
          emit('auth_resumed', { region, route, provider: authProvider })
          continue
        }

        regionAttempts += 1
        const failure = routeFailure(error)
        const result = router.record(region, route, failure)
        const attempt = {
          id: `${region.toLocaleLowerCase()}-attempt-${String(regionAttempts).padStart(4, '0')}`,
          region,
          action: 'search_web',
          provider: route,
          query: clean(action.query, 1_000),
          status: 'failed',
          ...failure,
        }
        attempts.push(attempt)
        safeHistoryCall(historyStore, 'appendAttempt', runId, attempt)
        emit('route_failed', { region, route, failure, router: result.snapshot })
        continue
      }

      regionAttempts += 1
      const candidates = (Array.isArray(discovery?.candidates) ? discovery.candidates : [])
        .map((candidate, index) => normalizeCandidate(candidate, route, region, index))
        .filter(Boolean)
      const newCandidates = candidates.filter((candidate) => !seenCandidates.has(candidate.url))
      let opened = false
      let player = false
      let addedEvidence = 0
      for (const candidate of newCandidates.slice(0, 8)) {
        assertActive()
        const result = await processCandidate({ candidate, region, action, route })
        opened ||= result.opened
        player ||= result.player
        addedEvidence += result.evidence.length
        const quotaAfterPage = quotaSnapshot(regions, [...evidenceByKey.values()], uniqueDomains, targetPerRegion, targetDomains)
        if (quotaAfterPage.regions[region].reached && quotaAfterPage.domainsReached) break
      }

      const routeResult = {
        newCandidateUrls: newCandidates.length,
        playwrightOpened: opened,
        containsPlayerExpression: player,
        uniqueRealEvidence: addedEvidence,
      }
      const routeRecord = router.record(region, route, routeResult)
      const attempt = {
        id: `${region.toLocaleLowerCase()}-attempt-${String(regionAttempts).padStart(4, '0')}`,
        region,
        action: 'search_web',
        provider: route,
        query: clean(action.query, 1_000),
        purpose: clean(action.purpose, 500),
        status: routeRecord.successful ? 'completed' : 'rejected',
        candidates: newCandidates.length,
        evidence: addedEvidence,
        routeWeights: routeRecord.snapshot?.weights || selection.weights,
      }
      attempts.push(attempt)
      safeHistoryCall(historyStore, 'appendAttempt', runId, attempt)
      emit('attempt_complete', { region, route, attempt, coverage: quotaSnapshot(regions, [...evidenceByKey.values()], uniqueDomains, targetPerRegion, targetDomains) })
    }
  }

  try {
    await browser.start()
    emit('browser_started', { regions })
    await Promise.all(regions.map(processRegion))
  } finally {
    await browser.close().catch(() => undefined)
  }

  const evidence = [...evidenceByKey.values()]
  const coverage = quotaSnapshot(regions, evidence, uniqueDomains, targetPerRegion, targetDomains)
  return {
    status: coverage.targetReached ? 'complete' : 'incomplete',
    evidence,
    attempts,
    coverage,
    events,
    routeSnapshots: Object.fromEntries(regions.map((region) => [region, router.getSnapshot(region)])),
  }
}
