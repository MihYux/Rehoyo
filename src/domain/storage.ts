import type { RuntimeTask } from './types'
import { isCompletedGroundedTask } from './grounding'

export const STORAGE_KEY = 'rehoyo.live.v2'
const LEGACY_STORAGE_KEY = 'rehoyo.demo.v1'
const MAX_RECENT_TASKS = 6

interface StoredTasks {
  version: 1
  tasks: RuntimeTask[]
}

export function loadCompletedTasks(): RuntimeTask[] {
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTasks>
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !parsed.tasks.every(isCompletedGroundedTask)) {
      throw new Error('Invalid Rehoyo task storage')
    }
    return parsed.tasks
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

export function saveCompletedTask(task: RuntimeTask): void {
  if (!isCompletedGroundedTask(task)) return
  const tasks = [task, ...loadCompletedTasks().filter((item) => item.id !== task.id)]
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, MAX_RECENT_TASKS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks } satisfies StoredTasks))
}
