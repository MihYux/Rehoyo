import { beforeEach, describe, expect, it } from 'vitest'
import { createReleaseProject, RELEASE_STORAGE_KEY, type ReleaseProjectInput } from './release-project'
import { loadReleaseProjects, saveReleaseProject } from './release-storage'

const input: ReleaseProjectInput = {
  game: '原神',
  version: '6.0',
  updateName: '新版本内容',
  releaseAt: '2026-10-01T00:00:00.000Z',
  regions: ['CN', 'JP', 'WEST'],
  brief: {
    primaryObjective: 'activity', secondaryObjectives: [], activityExpectation: 'high', revenueExpectation: 'medium',
    sellingPoints: [{ id: 'sp-1', type: 'map', name: '新地图', description: '新区域探索', priority: 'primary', regionalAdjustmentAllowed: true, regions: ['CN', 'JP', 'WEST'], assetIds: ['kv'] }],
    availableAssets: ['KV'], budgetLevel: 'medium', teamCapacity: ['社媒运营'], mandatoryActions: [], prohibitedActions: [],
    riskPreference: 'balanced', allowCharacterRelationshipPilot: false,
  },
}

describe('release project storage', () => {
  beforeEach(() => localStorage.clear())

  it('persists versioned release projects and restores them after restart', () => {
    const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
    saveReleaseProject(project)
    expect(JSON.parse(localStorage.getItem(RELEASE_STORAGE_KEY) || '{}')).toMatchObject({ version: 1 })
    expect(loadReleaseProjects()).toEqual([project])
  })

  it('clears corrupted storage and rejects snapshots containing synthetic evidence', () => {
    localStorage.setItem(RELEASE_STORAGE_KEY, '{broken')
    expect(loadReleaseProjects()).toEqual([])
    expect(localStorage.getItem(RELEASE_STORAGE_KEY)).toBeNull()

    const project = createReleaseProject(input, () => new Date('2026-07-24T00:00:00.000Z'))
    const invalid = {
      ...project,
      researchSnapshot: {
        id: 'invalid', dataMode: 'live', evidence: [{ synthetic: true }],
      },
    }
    expect(() => saveReleaseProject(invalid as never)).toThrow(/模拟|synthetic/i)
  })
})
