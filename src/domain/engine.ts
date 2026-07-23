import type {
  AgentDefinition,
  AgentId,
  AgentRuntimeState,
  AgentStateMap,
  AnalysisPreset,
  RuntimeTask,
} from './types'

const agentOrder: AgentId[] = ['research', 'sentiment', 'regional', 'strategy']

function fallbackDefinition(preset: AnalysisPreset, id: AgentId): AgentDefinition {
  const firstEvent = preset.events.find((event) => event.agentId === id)
  const starts: Record<AgentId, number> = {
    research: 0,
    sentiment: Math.round(preset.durationMs * 0.24),
    regional: Math.round(preset.durationMs * 0.48),
    strategy: Math.round(preset.durationMs * 0.72),
  }
  const ends: Record<AgentId, number> = {
    research: Math.round(preset.durationMs * 0.52),
    sentiment: Math.round(preset.durationMs * 0.74),
    regional: Math.round(preset.durationMs * 0.86),
    strategy: preset.durationMs,
  }

  return {
    id,
    name: id,
    englishName: id,
    objective: '',
    startOffsetMs: firstEvent?.offsetMs ?? starts[id],
    endOffsetMs: ends[id],
    sources: [],
    outputs: [],
  }
}

function definitionFor(preset: AnalysisPreset, id: AgentId) {
  return preset.agents.find((agent) => agent.id === id) ?? fallbackDefinition(preset, id)
}

export function startTask(preset: AnalysisPreset, startedAt = Date.now()): RuntimeTask {
  return advanceToElapsedTime(
    preset,
    {
      id: `${preset.id}-${startedAt}`,
      presetId: preset.id,
      gameName: preset.game.name,
      versionTitle: `${preset.version.label} ${preset.version.title}`,
      status: 'running',
      startedAt,
      elapsedMs: 0,
      visibleEventIds: [],
      dataMode: preset.dataMode ?? 'demo',
    },
    0,
  )
}

export function advanceToElapsedTime(
  preset: AnalysisPreset,
  task: RuntimeTask,
  elapsedMs: number,
): RuntimeTask {
  const boundedElapsed = Math.max(0, Math.min(elapsedMs, preset.durationMs))
  const isComplete = boundedElapsed >= preset.durationMs

  return {
    ...task,
    elapsedMs: boundedElapsed,
    status: isComplete ? 'completed' : 'running',
    visibleEventIds: preset.events
      .filter((event) => event.offsetMs <= boundedElapsed)
      .sort((a, b) => a.offsetMs - b.offsetMs)
      .map((event) => event.id),
    completedAt: isComplete ? task.startedAt + preset.durationMs : undefined,
  }
}

function deriveAgentState(
  preset: AnalysisPreset,
  task: RuntimeTask,
  id: AgentId,
): AgentRuntimeState {
  const definition = definitionFor(preset, id)
  const elapsed = task.elapsedMs
  const duration = Math.max(definition.endOffsetMs - definition.startOffsetMs, 1)
  const progress = Math.round(
    Math.max(0, Math.min(1, (elapsed - definition.startOffsetMs) / duration)) * 100,
  )
  const visibleEvents = preset.events.filter(
    (event) => event.agentId === id && task.visibleEventIds.includes(event.id),
  )

  let status: AgentRuntimeState['status']
  if (task.status === 'failed') status = 'failed'
  else if (elapsed >= definition.endOffsetMs) status = 'completed'
  else if (elapsed >= definition.endOffsetMs - Math.min(1_500, duration * 0.12)) status = 'handoff'
  else if (elapsed >= definition.startOffsetMs) status = 'running'
  else if (id === 'strategy') status = 'locked'
  else status = 'queued'

  return {
    id,
    status,
    progress,
    evidenceIds: [...new Set(visibleEvents.flatMap((event) => event.evidenceIds))],
    findingIds: visibleEvents
      .filter((event) => event.kind === 'finding' || event.kind === 'risk')
      .map((event) => event.id),
  }
}

export function deriveAgentStates(preset: AnalysisPreset, task: RuntimeTask): AgentStateMap {
  return Object.fromEntries(
    agentOrder.map((id) => [id, deriveAgentState(preset, task, id)]),
  ) as AgentStateMap
}
