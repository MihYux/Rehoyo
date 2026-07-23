import type { RuntimeTask } from './types'

export const STORAGE_KEY = 'rehoyo.demo.v1'
const MAX_RECENT_TASKS = 6

interface StoredTasks {
  version: 1
  tasks: RuntimeTask[]
}

function isRuntimeTask(value: unknown): value is RuntimeTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<RuntimeTask>
  return (
    typeof task.id === 'string' &&
    typeof task.presetId === 'string' &&
    typeof task.gameName === 'string' &&
    typeof task.versionTitle === 'string' &&
    task.status === 'completed' &&
    typeof task.startedAt === 'number' &&
    typeof task.elapsedMs === 'number' &&
    Array.isArray(task.visibleEventIds)
  )
}

export function loadCompletedTasks(): RuntimeTask[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTasks>
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !parsed.tasks.every(isRuntimeTask)) {
      throw new Error('Invalid Rehoyo task storage')
    }
    return parsed.tasks
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

export function saveCompletedTask(task: RuntimeTask): void {
  if (task.status !== 'completed') return
  const tasks = [task, ...loadCompletedTasks().filter((item) => item.id !== task.id)]
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, MAX_RECENT_TASKS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks } satisfies StoredTasks))
}
