import { describe, expect, it } from 'vitest'
import packageManifest from '../../package.json'
import playwrightConfig from '../../playwright.config'

describe('renderer Playwright server', () => {
  it('uses the lifecycle-owned runner instead of Playwright webServer on Windows', () => {
    expect(playwrightConfig.webServer).toBeUndefined()
    expect(packageManifest.scripts['test:e2e']).toBe('node tests/e2e/run.mjs')
  })
})
