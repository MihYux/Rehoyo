export const SEARCH_ROUTES = Object.freeze([
  'openai_search',
  'bigmodel_search',
  'webfetch',
])

const REGIONS = Object.freeze(['CN', 'JP', 'WEST'])
const INITIAL_WEIGHTS = Object.freeze({
  openai_search: 50,
  bigmodel_search: 25,
  webfetch: 25,
})

function assertRegion(region) {
  if (!REGIONS.includes(region)) throw new Error(`Unsupported research region: ${region}`)
}

function assertRoute(route) {
  if (!SEARCH_ROUTES.includes(route)) throw new Error(`Unsupported search route: ${route}`)
}

function hashText(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededValue(seed) {
  let value = hashText(seed) || 0x9e3779b9
  return () => {
    value += 0x6d2b79f5
    let mixed = value
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function createWarmupSchedule(runId, region) {
  assertRegion(region)
  const schedule = [
    ...Array(6).fill('openai_search'),
    ...Array(3).fill('bigmodel_search'),
    ...Array(3).fill('webfetch'),
  ]
  const random = seededValue(`${String(runId)}:${region}:warmup`)
  for (let index = schedule.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[schedule[index], schedule[target]] = [schedule[target], schedule[index]]
  }
  return schedule
}

export function qualifiesAsSuccessfulDiscovery(result = {}) {
  return Number(result.newCandidateUrls) > 0
    && result.playwrightOpened === true
    && result.containsPlayerExpression === true
    && Number(result.uniqueRealEvidence) > 0
}

function routeProvider(route) {
  if (route === 'openai_search') return 'openai'
  if (route === 'bigmodel_search') return 'bigmodel'
  return null
}

function isTransientFailure(result) {
  const status = Number(result?.httpStatus || 0)
  return status === 429 || status >= 500 || result?.errorType === 'timeout'
}

function createRouteState() {
  return {
    attempts: 0,
    successfulAttempts: 0,
    candidates: 0,
    evidence: 0,
    consecutiveTransientFailures: 0,
    circuitOpenUntil: 0,
    probe: false,
  }
}

function copyWeights(weights) {
  return Object.fromEntries(SEARCH_ROUTES.map((route) => [route, Number(weights[route] || 0)]))
}

function normalizeAdaptiveWeights(states, now) {
  let healthyRoutes = SEARCH_ROUTES.filter((route) => states[route].circuitOpenUntil <= now)
  if (!healthyRoutes.length) healthyRoutes = [...SEARCH_ROUTES]

  const smoothed = Object.fromEntries(healthyRoutes.map((route) => [
    route,
    (states[route].successfulAttempts + 1) / (states[route].attempts + 2),
  ]))
  const totalRate = Object.values(smoothed).reduce((sum, value) => sum + value, 0) || 1
  const exploration = 15
  const distributable = 100 - (exploration * healthyRoutes.length)
  const weights = Object.fromEntries(SEARCH_ROUTES.map((route) => [route, 0]))

  healthyRoutes.forEach((route) => {
    weights[route] = exploration + distributable * (smoothed[route] / totalRate)
  })

  const currentTotal = Object.values(weights).reduce((sum, value) => sum + value, 0)
  weights[healthyRoutes.at(-1)] += 100 - currentTotal
  return weights
}

function publicRouteState(state, now) {
  return {
    attempts: state.attempts,
    successfulAttempts: state.successfulAttempts,
    successRate: state.attempts ? state.successfulAttempts / state.attempts : 0,
    candidates: state.candidates,
    evidence: state.evidence,
    circuitState: state.circuitOpenUntil > now ? 'open' : state.probe ? 'probe' : 'closed',
    circuitOpenUntil: state.circuitOpenUntil || null,
  }
}

export function createAdaptiveSearchRouter(options = {}) {
  const runId = String(options.runId || '').trim()
  if (!runId) throw new Error('Adaptive search routing requires a runId.')
  const now = typeof options.now === 'function' ? options.now : Date.now
  const circuitFailureThreshold = Math.max(1, Number(options.circuitFailureThreshold) || 3)
  const circuitCooldownMs = Math.max(1_000, Number(options.circuitCooldownMs) || 60_000)
  const regions = new Map()

  const regionState = (region) => {
    assertRegion(region)
    if (!regions.has(region)) {
      regions.set(region, {
        selections: 0,
        recordedAttempts: 0,
        revision: 0,
        warmup: createWarmupSchedule(runId, region),
        weights: copyWeights(INITIAL_WEIGHTS),
        routes: Object.fromEntries(SEARCH_ROUTES.map((route) => [route, createRouteState()])),
      })
    }
    return regions.get(region)
  }

  const refreshRecoveredRoutes = (state) => {
    const timestamp = now()
    let recovered = false
    for (const route of SEARCH_ROUTES) {
      const routeState = state.routes[route]
      if (routeState.circuitOpenUntil && routeState.circuitOpenUntil <= timestamp) {
        routeState.circuitOpenUntil = 0
        routeState.consecutiveTransientFailures = 0
        routeState.probe = true
        recovered = true
      }
    }
    if (recovered) state.weights = normalizeAdaptiveWeights(state.routes, timestamp)
  }

  const recalculate = (state) => {
    state.weights = normalizeAdaptiveWeights(state.routes, now())
    state.revision += 1
  }

  const snapshot = (region) => {
    const state = regionState(region)
    refreshRecoveredRoutes(state)
    const timestamp = now()
    const routes = Object.fromEntries(SEARCH_ROUTES.map((route) => [
      route,
      publicRouteState(state.routes[route], timestamp),
    ]))
    return {
      region,
      phase: state.recordedAttempts < 12 ? 'warmup' : 'adaptive',
      revision: state.revision,
      selections: state.selections,
      attempts: state.recordedAttempts,
      weights: copyWeights(state.weights),
      stats: Object.fromEntries(SEARCH_ROUTES.map((route) => [route, {
        attempts: routes[route].attempts,
        successfulAttempts: routes[route].successfulAttempts,
        successRate: routes[route].successRate,
        candidates: routes[route].candidates,
        evidence: routes[route].evidence,
      }])),
      routes,
    }
  }

  return Object.freeze({
    select(region) {
      const state = regionState(region)
      refreshRecoveredRoutes(state)
      let route
      if (state.selections < state.warmup.length) {
        route = state.warmup[state.selections]
      } else {
        const random = seededValue(`${runId}:${region}:selection:${state.selections}`)()
        const threshold = random * 100
        let cumulative = 0
        route = SEARCH_ROUTES.find((candidate) => {
          cumulative += state.weights[candidate]
          return threshold <= cumulative && state.weights[candidate] > 0
        }) || SEARCH_ROUTES.find((candidate) => state.weights[candidate] > 0) || 'openai_search'
      }
      state.selections += 1
      return { route, ...snapshot(region) }
    },

    record(region, route, result = {}) {
      const state = regionState(region)
      assertRoute(route)
      const status = Number(result.httpStatus || 0)
      if (status === 401 || status === 403) {
        return {
          route,
          authRequired: routeProvider(route),
          recordedAttempt: false,
          circuitState: publicRouteState(state.routes[route], now()).circuitState,
        }
      }

      const routeState = state.routes[route]
      const successful = qualifiesAsSuccessfulDiscovery(result)
      routeState.attempts += 1
      routeState.candidates += Math.max(0, Number(result.newCandidateUrls) || 0)
      routeState.evidence += Math.max(0, Number(result.uniqueRealEvidence) || 0)
      state.recordedAttempts += 1

      if (successful) {
        routeState.successfulAttempts += 1
        routeState.consecutiveTransientFailures = 0
        routeState.probe = false
      } else if (isTransientFailure(result)) {
        routeState.consecutiveTransientFailures += 1
        if (routeState.consecutiveTransientFailures >= circuitFailureThreshold) {
          routeState.circuitOpenUntil = now() + circuitCooldownMs
          routeState.probe = false
          state.weights = normalizeAdaptiveWeights(state.routes, now())
        }
      } else {
        routeState.consecutiveTransientFailures = 0
      }

      if (state.recordedAttempts === 12 || (state.recordedAttempts > 12 && (state.recordedAttempts - 12) % 6 === 0)) {
        recalculate(state)
      }

      return {
        route,
        successful,
        recordedAttempt: true,
        authRequired: null,
        circuitState: publicRouteState(routeState, now()).circuitState,
        snapshot: snapshot(region),
      }
    },

    getSnapshot(region) {
      return snapshot(region)
    },
  })
}
