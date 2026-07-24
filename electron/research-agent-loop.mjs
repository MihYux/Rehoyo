import { deriveRegionalCoverage } from './research-policy.mjs'
import { executeResearchAction, parseResearchAction } from './research-tools.mjs'

function actionKey(action) {
  return JSON.stringify(action)
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Research stopped.', 'AbortError')
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
  maxSteps = 160,
  maxRepeatedActions = 3,
}) {
  if (!policy?.requestedRegions?.includes(region)) throw new Error('Regional agent requires a region included by policy.')
  if (typeof model?.nextAction !== 'function') throw new Error('Regional agent requires a model action provider.')
  const evidence = [...(Array.isArray(state.evidence) ? state.evidence : [])]
  const attempts = [...(Array.isArray(state.attempts) ? state.attempts : [])]
  const history = [...(Array.isArray(state.history) ? state.history : [])]
  const repetitions = new Map()

  for (let step = 0; step < maxSteps; step += 1) {
    abortIfNeeded(signal)
    const coverage = deriveRegionalCoverage(evidence, attempts, policy)
    const regionCoverage = coverage.regions[region]
    const rawAction = await model.nextAction({
      region,
      request,
      quota: regionCoverage,
      globalDomains: coverage.globalDomains,
      targetGlobalDomains: coverage.targetGlobalDomains,
      history: history.slice(-24),
      attemptedQueries: history.filter((item) => item.action?.type === 'search_web').map((item) => item.action.query),
    })
    let action
    try {
      action = parseResearchAction(rawAction)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid research action.'
      history.push({ action: rawAction, result: { error: message } })
      onEvent({ kind: 'action_rejected', region, message })
      continue
    }

    const key = actionKey(action)
    const repeated = (repetitions.get(key) || 0) + 1
    repetitions.set(key, repeated)
    if (repeated > maxRepeatedActions) {
      const reason = `Agent 重复同一研究动作 ${repeated} 次，已停止该循环并保留未完成状态。`
      onEvent({ kind: 'loop_stopped', region, message: reason, action })
      return { status: 'incomplete', region, reason, evidence, attempts, history, coverage }
    }

    if (action.type === 'finish_region') {
      if (!regionCoverage.reached) {
        const message = `${region} 当前只有 ${regionCoverage.evidence}/${regionCoverage.target} 条证据，配额未达到，拒绝提前完成。`
        history.push({ action, result: { rejected: true, reason: message } })
        onEvent({ kind: 'action_rejected', region, message, action })
        continue
      }
      onEvent({ kind: 'region_complete', region, message: action.reason || `${region} 配额完成`, action })
      return { status: 'complete', region, evidence, attempts, history, coverage }
    }

    onEvent({ kind: 'action_started', region, message: `${region} · ${action.type}`, action })
    try {
      const result = await executeResearchAction(action, tools)
      evidence.push(...result.evidence)
      attempts.push(...result.inspected)
      const entry = {
        action,
        result: {
          evidenceAdded: result.evidence.length,
          inspectedAdded: result.inspected.length,
          pagesAdded: result.pages.length,
          message: result.message,
        },
      }
      history.push(entry)
      onEvent({ kind: 'action_completed', region, message: `${action.type} 新增 ${result.evidence.length} 条证据`, action, ...entry.result })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research action failed.'
      history.push({ action, result: { error: message } })
      onEvent({ kind: 'action_failed', region, message, action })
    }
  }

  const coverage = deriveRegionalCoverage(evidence, attempts, policy)
  return { status: 'incomplete', region, reason: `动态研究达到 ${maxSteps} 步安全上限。`, evidence, attempts, history, coverage }
}
