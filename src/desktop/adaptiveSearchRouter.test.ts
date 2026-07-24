import { describe, expect, it } from 'vitest'
import {
  SEARCH_ROUTES,
  createAdaptiveSearchRouter,
  createWarmupSchedule,
  qualifiesAsSuccessfulDiscovery,
} from '../../electron/adaptive-search-router.mjs'

describe('adaptive regional search router', () => {
  it('uses an auditable deterministic 6/3/3 warmup for every region', () => {
    const first = createWarmupSchedule('run-42', 'CN')
    const replay = createWarmupSchedule('run-42', 'CN')
    const japan = createWarmupSchedule('run-42', 'JP')

    expect(first).toEqual(replay)
    expect(first).not.toEqual(japan)
    expect(first).toHaveLength(12)
    expect(Object.fromEntries(SEARCH_ROUTES.map((route) => [
      route,
      first.filter((entry) => entry === route).length,
    ]))).toEqual({
      openai_search: 6,
      bigmodel_search: 3,
      webfetch: 3,
    })
  })

  it('counts success only after a new candidate is opened and yields unique real player evidence', () => {
    expect(qualifiesAsSuccessfulDiscovery({
      newCandidateUrls: 1,
      playwrightOpened: true,
      containsPlayerExpression: true,
      uniqueRealEvidence: 1,
    })).toBe(true)

    expect(qualifiesAsSuccessfulDiscovery({
      newCandidateUrls: 1,
      playwrightOpened: false,
      containsPlayerExpression: true,
      uniqueRealEvidence: 1,
    })).toBe(false)
    expect(qualifiesAsSuccessfulDiscovery({
      newCandidateUrls: 1,
      playwrightOpened: true,
      containsPlayerExpression: false,
      uniqueRealEvidence: 1,
    })).toBe(false)
    expect(qualifiesAsSuccessfulDiscovery({
      newCandidateUrls: 1,
      playwrightOpened: true,
      containsPlayerExpression: true,
      uniqueRealEvidence: 0,
    })).toBe(false)
  })

  it('rebalances independently by region after warmup and keeps healthy routes at 15% or more', () => {
    const router = createAdaptiveSearchRouter({ runId: 'adaptive-run' })

    for (const region of ['CN', 'JP'] as const) {
      for (let index = 0; index < 12; index += 1) {
        const selection = router.select(region)
        const success = region === 'CN'
          ? selection.route === 'openai_search'
          : selection.route === 'webfetch'
        router.record(region, selection.route, {
          newCandidateUrls: success ? 2 : 0,
          playwrightOpened: success,
          containsPlayerExpression: success,
          uniqueRealEvidence: success ? 1 : 0,
        })
      }
    }

    const cn = router.getSnapshot('CN')
    const jp = router.getSnapshot('JP')
    expect(cn.weights.openai_search).toBeGreaterThan(cn.weights.webfetch)
    expect(jp.weights.webfetch).toBeGreaterThan(jp.weights.openai_search)
    expect(Object.values(cn.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 8)
    expect(Object.values(jp.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 8)
    expect(Object.values(cn.weights).every((value) => value >= 15 && value <= 70)).toBe(true)
    expect(cn.stats.openai_search.attempts).toBe(6)
    expect(cn.stats.bigmodel_search.attempts).toBe(3)
    expect(cn.stats.webfetch.attempts).toBe(3)
  })

  it('recomputes adaptive weights only at six-attempt audit boundaries', () => {
    const router = createAdaptiveSearchRouter({ runId: 'audit-run' })
    for (let index = 0; index < 12; index += 1) {
      const selection = router.select('WEST')
      router.record('WEST', selection.route, {
        newCandidateUrls: 0,
        playwrightOpened: false,
        containsPlayerExpression: false,
        uniqueRealEvidence: 0,
      })
    }
    const warmupWeights = router.getSnapshot('WEST').weights

    for (let index = 0; index < 5; index += 1) {
      const selection = router.select('WEST')
      router.record('WEST', selection.route, {
        newCandidateUrls: 2,
        playwrightOpened: true,
        containsPlayerExpression: true,
        uniqueRealEvidence: 1,
      })
    }
    expect(router.getSnapshot('WEST').weights).toEqual(warmupWeights)

    const sixth = router.select('WEST')
    router.record('WEST', sixth.route, {
      newCandidateUrls: 2,
      playwrightOpened: true,
      containsPlayerExpression: true,
      uniqueRealEvidence: 1,
    })
    expect(router.getSnapshot('WEST').revision).toBe(2)
  })

  it('temporarily removes a route after repeated transient failures and probes it after cooldown', () => {
    let now = 10_000
    const router = createAdaptiveSearchRouter({
      runId: 'circuit-run',
      now: () => now,
      circuitFailureThreshold: 2,
      circuitCooldownMs: 5_000,
    })

    router.record('CN', 'openai_search', { httpStatus: 500 })
    const opened = router.record('CN', 'openai_search', { httpStatus: 429 })
    expect(opened.circuitState).toBe('open')
    expect(router.getSnapshot('CN').weights.openai_search).toBe(0)

    now += 5_001
    const recovered = router.getSnapshot('CN')
    expect(recovered.routes.openai_search.circuitState).toBe('probe')
    expect(recovered.weights.openai_search).toBeGreaterThanOrEqual(15)
  })

  it('marks 401 and 403 as provider-specific reauthentication without treating them as evidence failures', () => {
    const router = createAdaptiveSearchRouter({ runId: 'auth-run' })
    expect(router.record('JP', 'openai_search', { httpStatus: 401 })).toMatchObject({
      authRequired: 'openai',
      recordedAttempt: false,
    })
    expect(router.getSnapshot('JP').stats.openai_search.attempts).toBe(0)
  })
})
