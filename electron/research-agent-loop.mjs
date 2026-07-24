import { deriveRegionalCoverage } from './research-policy.mjs'
import { executeResearchAction, getResearchToolSchemas, parseResearchAction } from './research-tools.mjs'

const DEFAULT_MAX_STEPS = 160
const DEFAULT_MAX_REPEATED_ACTIONS = 3
const DEFAULT_MAX_CONSECUTIVE_INVALID = 2
const DEFAULT_MAX_TOTAL_INVALID = 4
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000

function actionKey(action) {
  return JSON.stringify(action)
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Research stopped.', 'AbortError')
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function clockNow(clock) {
  return typeof clock?.now === 'function' ? Number(clock.now()) : Date.now()
}

function timeoutError(label, timeoutMs) {
  const error = new Error(`${label} timeout after ${timeoutMs}ms.`)
  error.name = 'ResearchRequestTimeoutError'
  return error
}

async function withinRequestDeadline(task, { timeoutMs, signal, clock, label }) {
  abortIfNeeded(signal)
  const controller = new AbortController()
  const setTimer = typeof clock?.setTimeout === 'function' ? clock.setTimeout.bind(clock) : setTimeout
  const clearTimer = typeof clock?.clearTimeout === 'function' ? clock.clearTimeout.bind(clock) : clearTimeout
  let timer
  let parentAbort

  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => {
      const error = timeoutError(label, timeoutMs)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })

  const parentAbortPromise = new Promise((_, reject) => {
    if (!signal) return
    parentAbort = () => {
      const reason = signal.reason || new DOMException('Research stopped.', 'AbortError')
      controller.abort(reason)
      reject(reason)
    }
    signal.addEventListener('abort', parentAbort, { once: true })
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      timeout,
      parentAbortPromise,
    ])
  } finally {
    if (timer !== undefined) clearTimer(timer)
    if (signal && parentAbort) signal.removeEventListener('abort', parentAbort)
  }
}

function resultSnapshot({ status, region, reason, evidence, attempts, history, policy, invalidActions, consecutiveInvalidActions, startedAt, deadlineAt }) {
  return {
    status,
    region,
    ...(reason ? { reason } : {}),
    evidence,
    attempts,
    history,
    coverage: deriveRegionalCoverage(evidence, attempts, policy),
    invalidActions,
    consecutiveInvalidActions,
    startedAt,
    deadlineAt,
  }
}

export async function runRegionalResearchAgent({
  region,
  request,
  policy,
  model,
  tools,
  state = {},
  onEvent = () => {},
  signal,
  maxSteps = DEFAULT_MAX_STEPS,
  maxRepeatedActions = DEFAULT_MAX_REPEATED_ACTIONS,
  maxConsecutiveInvalidActions = DEFAULT_MAX_CONSECUTIVE_INVALID,
  maxTotalInvalidActions = DEFAULT_MAX_TOTAL_INVALID,
  maxRunMinutes = policy?.maxRunMinutes || 45,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  clock,
}) {
  if (!policy?.requestedRegions?.includes(region)) throw new Error('Regional agent requires a region included by policy.')
  if (typeof model?.nextAction !== 'function') throw new Error('Regional agent requires a model action provider.')

  const safeMaxSteps = positiveInteger(maxSteps, DEFAULT_MAX_STEPS)
  const safeMaxRepeatedActions = positiveInteger(maxRepeatedActions, DEFAULT_MAX_REPEATED_ACTIONS)
  const safeConsecutiveInvalidLimit = positiveInteger(maxConsecutiveInvalidActions, DEFAULT_MAX_CONSECUTIVE_INVALID)
  const safeTotalInvalidLimit = positiveInteger(maxTotalInvalidActions, DEFAULT_MAX_TOTAL_INVALID)
  const safeRunMinutes = positiveInteger(maxRunMinutes, 45)
  const safeRequestTimeoutMs = positiveInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)
  const evidence = [...(Array.isArray(state.evidence) ? state.evidence : [])]
  const attempts = [...(Array.isArray(state.attempts) ? state.attempts : [])]
  const history = [...(Array.isArray(state.history) ? state.history : [])]
  const repetitions = new Map()
  let invalidActions = positiveInteger(state.invalidActions, 0)
  let consecutiveInvalidActions = positiveInteger(state.consecutiveInvalidActions, 0)
  const startedAt = clockNow(clock)
  const deadlineAt = startedAt + safeRunMinutes * 60_000

  const incomplete = (reason) => resultSnapshot({
    status: 'incomplete',
    region,
    reason,
    evidence,
    attempts,
    history,
    policy,
    invalidActions,
    consecutiveInvalidActions,
    startedAt,
    deadlineAt,
  })

  for (let step = 0; step < safeMaxSteps; step += 1) {
    abortIfNeeded(signal)
    const beforeStep = clockNow(clock)
    if (beforeStep >= deadlineAt) {
      const reason = `${region} 动态研究已达到 ${safeRunMinutes} 分钟总截止时间，保留未完成状态。`
      onEvent({ kind: 'deadline_reached', region, message: reason, deadlineAt })
      return incomplete(reason)
    }

    const coverage = deriveRegionalCoverage(evidence, attempts, policy)
    const regionCoverage = coverage.regions[region]
    const effectiveRequestTimeoutMs = Math.max(1, Math.min(safeRequestTimeoutMs, deadlineAt - beforeStep))
    let rawAction
    try {
      rawAction = await withinRequestDeadline(
        (requestSignal) => model.nextAction({
          region,
          request,
          quota: regionCoverage,
          globalDomains: coverage.globalDomains,
          targetGlobalDomains: coverage.targetGlobalDomains,
          history: history.slice(-24),
          attemptedQueries: history.filter((item) => item.action?.type === 'search_web').map((item) => item.action.query),
          toolSchemas: getResearchToolSchemas(),
          deadlineAt,
          requestTimeoutMs: effectiveRequestTimeoutMs,
          signal: requestSignal,
        }),
        {
          timeoutMs: effectiveRequestTimeoutMs,
          signal,
          clock,
          label: `${region} model request`,
        },
      )
    } catch (error) {
      abortIfNeeded(signal)
      const message = error instanceof Error ? error.message : 'Regional model request failed.'
      history.push({ action: null, result: { error: message } })
      onEvent({ kind: 'model_failed', region, message })
      continue
    }

    if (clockNow(clock) >= deadlineAt) {
      const reason = `${region} 动态研究已达到 ${safeRunMinutes} 分钟总截止时间，保留未完成状态。`
      history.push({ action: null, result: { rejected: true, reason } })
      onEvent({ kind: 'deadline_reached', region, message: reason, deadlineAt })
      return incomplete(reason)
    }

    let action
    try {
      action = parseResearchAction(rawAction)
      consecutiveInvalidActions = 0
    } catch (error) {
      invalidActions += 1
      consecutiveInvalidActions += 1
      const message = error instanceof Error ? error.message : 'Invalid research action.'
      history.push({ action: rawAction, result: { error: message, invalidAction: true } })
      onEvent({
        kind: 'action_rejected',
        region,
        message,
        invalidActions,
        consecutiveInvalidActions,
      })
      if (consecutiveInvalidActions >= safeConsecutiveInvalidLimit) {
        const reason = `${region} Agent 连续返回 ${consecutiveInvalidActions} 次非法动作，已停止并保留未完成状态。`
        onEvent({ kind: 'protocol_stopped', region, message: reason, invalidActions, consecutiveInvalidActions })
        return incomplete(reason)
      }
      if (invalidActions >= safeTotalInvalidLimit) {
        const reason = `${region} Agent 累计返回 ${invalidActions} 次非法动作，已停止并保留未完成状态。`
        onEvent({ kind: 'protocol_stopped', region, message: reason, invalidActions, consecutiveInvalidActions })
        return incomplete(reason)
      }
      continue
    }

    const key = actionKey(action)
    const repeated = (repetitions.get(key) || 0) + 1
    repetitions.set(key, repeated)
    if (repeated > safeMaxRepeatedActions) {
      const reason = `${region} Agent 重复同一研究动作 ${repeated} 次，已停止该循环并保留未完成状态。`
      onEvent({ kind: 'loop_stopped', region, message: reason, action })
      return incomplete(reason)
    }

    if (action.type === 'finish_region') {
      if (!regionCoverage.reached) {
        const message = `${region} 当前只有 ${regionCoverage.evidence}/${regionCoverage.target} 条证据，配额未达到，拒绝提前完成。`
        history.push({ action, result: { rejected: true, reason: message } })
        onEvent({ kind: 'action_rejected', region, message, action })
        continue
      }
      onEvent({ kind: 'region_complete', region, message: action.reason, action })
      return resultSnapshot({
        status: 'complete',
        region,
        evidence,
        attempts,
        history,
        policy,
        invalidActions,
        consecutiveInvalidActions,
        startedAt,
        deadlineAt,
      })
    }

    onEvent({ kind: 'action_started', region, message: `${region} · ${action.type}`, action })
    const beforeAction = clockNow(clock)
    const actionTimeoutMs = Math.max(1, Math.min(safeRequestTimeoutMs, deadlineAt - beforeAction))
    try {
      const result = await withinRequestDeadline(
        (requestSignal) => executeResearchAction(action, tools, { signal: requestSignal, deadlineAt }),
        { timeoutMs: actionTimeoutMs, signal, clock, label: `${region} ${action.type}` },
      )
      evidence.push(...result.evidence)
      attempts.push(...result.inspected)
      const entry = {
        action,
        result: {
          evidenceAdded: result.evidence.length,
          inspectedAdded: result.inspected.length,
          pagesAdded: result.pages.length,
          candidatesAdded: result.candidates.length,
          message: result.message,
        },
      }
      history.push(entry)
      onEvent({ kind: 'action_completed', region, message: `${action.type} 新增 ${result.evidence.length} 条证据`, action, ...entry.result })
    } catch (error) {
      abortIfNeeded(signal)
      const message = error instanceof Error ? error.message : 'Research action failed.'
      history.push({ action, result: { error: message } })
      onEvent({ kind: 'action_failed', region, message, action })
    }
  }

  return incomplete(`动态研究达到 ${safeMaxSteps} 步安全上限。`)
}
