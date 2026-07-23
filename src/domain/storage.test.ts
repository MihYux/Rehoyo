import { beforeEach, describe, expect, it } from 'vitest'
import { loadCompletedTasks, saveCompletedTask } from './storage'
import type { RuntimeTask } from './types'

const completedTask: RuntimeTask = {
  id: 'task-1',
  presetId: 'genshin-5-0',
  gameName: '原神',
  versionTitle: '5.0 荣花与炎日之途',
  status: 'completed',
  startedAt: 1_000,
  elapsedMs: 40_000,
  completedAt: 41_000,
  visibleEventIds: ['event-1'],
}

describe('completed task storage', () => {
  beforeEach(() => localStorage.clear())

  it('saves completed tasks newest first without duplicates', () => {
    saveCompletedTask(completedTask)
    saveCompletedTask({ ...completedTask, completedAt: 42_000 })

    expect(loadCompletedTasks()).toEqual([{ ...completedTask, completedAt: 42_000 }])
  })

  it('clears invalid persisted data instead of throwing', () => {
    localStorage.setItem('rehoyo.demo.v1', '{broken')

    expect(loadCompletedTasks()).toEqual([])
    expect(localStorage.getItem('rehoyo.demo.v1')).toBeNull()
  })
})
