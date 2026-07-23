import { beforeEach, describe, expect, it } from 'vitest'
import { createGroundedCompletedTask } from '../test/groundedFixture'
import { loadCompletedTasks, saveCompletedTask, STORAGE_KEY } from './storage'

describe('grounded task storage', () => {
  beforeEach(() => localStorage.clear())

  it('saves only completed tasks with verified real evidence', () => {
    const completedTask = createGroundedCompletedTask()
    saveCompletedTask(completedTask)
    saveCompletedTask({ ...completedTask, completedAt: 42_000 })

    expect(loadCompletedTasks()).toEqual([{ ...completedTask, completedAt: 42_000 }])
  })

  it('refuses completed tasks without a grounded preset snapshot', () => {
    const completedTask = createGroundedCompletedTask()
    saveCompletedTask({ ...completedTask, presetSnapshot: undefined })
    expect(loadCompletedTasks()).toEqual([])
  })

  it('clears legacy demo storage and corrupted live storage', () => {
    localStorage.setItem('rehoyo.demo.v1', JSON.stringify({ version: 1, tasks: [] }))
    localStorage.setItem(STORAGE_KEY, '{broken')

    expect(loadCompletedTasks()).toEqual([])
    expect(localStorage.getItem('rehoyo.demo.v1')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
