import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createGroundedTestPreset } from '../../src/test/groundedFixture'

async function aaViolations(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return audit.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map((node) => node.target.join(' ')) }))
}

async function assertChildrenDoNotOverlap(page: Page, selector: string) {
  const boxes = await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }))
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first]
      const b = boxes[second]
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
    }
  }
}

test.beforeEach(async ({ page }) => {
  const fixture = createGroundedTestPreset()
  await page.addInitScript(({ preset }) => {
    const listeners: Array<(payload: unknown) => void> = []
    Object.defineProperty(globalThis, 'rehoyoDesktop', {
      configurable: true,
      value: {
        isElectron: true,
        platform: 'win32',
        connection: {
          getStatus: async () => ({ configured: true, provider: 'bigmodel', endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4', endpointHost: 'open.bigmodel.cn', model: 'glm-5.2', persistence: 'encrypted' }),
          save: async () => { throw new Error('E2E starts preconfigured.') },
          clear: async () => ({ configured: false }),
        },
        advisor: { getStatus: async () => ({ configured: true, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' }), ask: async () => ({ ok: false, error: 'Not used.' }) },
        research: {
          getStatus: async () => ({ configured: true, model: 'glm-5.2', retrieval: 'E2E verified HTTPS fixture', searchEndpoint: 'open.bigmodel.cn' }),
          onEvent: (listener: (payload: unknown) => void) => {
            listeners.push(listener)
            return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1) }
          },
          run: async (request: { runId: string; gameName: string; versionLabel: string; versionTitle: string }) => {
            const resultPreset = {
              ...preset,
              id: `live-e2e-${encodeURIComponent(request.gameName)}`,
              game: { ...preset.game, id: 'live-e2e-game', name: request.gameName },
              version: { ...preset.version, id: 'live-e2e-version', label: request.versionLabel, title: request.versionTitle },
              researchCoverage: { targetSites: 30, targetEvidence: 30, sitesAttempted: 37, evidenceCollected: preset.evidence.length, attempts: 74, providers: ['brave', 'bigmodel'], targetReached: false },
            }
            const sourceEvent = { ...resultPreset.events[1], sitesAttempted: 12, evidenceCount: resultPreset.evidence.length, searchProvider: 'brave', evidenceRecords: resultPreset.evidence }
            listeners.forEach((listener) => listener({ runId: request.runId, event: sourceEvent }))
            return new Promise((resolve) => {
              Object.assign(globalThis, {
                __completeRehoyoResearch: () => {
                  resultPreset.events.forEach((event) => listeners.forEach((listener) => listener({ runId: request.runId, event })))
                  resolve({ ok: true, preset: resultPreset })
                },
              })
            })
          },
        },
      },
    })
  }, { preset: fixture })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
})

async function createReleaseProject(page: Page) {
  await page.getByRole('button', { name: /创建版本发行项目/ }).click()
  await page.getByRole('button', { name: '选择游戏 崩坏：星穹铁道' }).click()
  await page.getByLabel('版本号').fill('2.0')
  await page.getByLabel('预计上线日期').fill('2026-09-10')
  await page.getByLabel('更新名称').fill('假如在午夜入梦')
  await page.getByLabel('核心卖点名称').fill('黑天鹅与匹诺康尼故事')
  await page.getByLabel('核心卖点说明').fill('围绕已公开的角色与世界观内容建立版本发行主轴。')
  await page.getByLabel('角色设定与审核模板').check()
  await page.getByLabel('允许角色关系发行灰度预演').check()
  await page.getByRole('button', { name: /开始区域研究/ }).click()
}

test('runs the four-stage release decision workflow without overlapping primary controls', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })

  await expect(page.getByRole('heading', { name: /从看见全球玩家/ })).toBeVisible()
  await assertChildrenDoNotOverlap(page, '.release-hero-actions > button')
  await page.waitForTimeout(180)
  await page.screenshot({ path: testInfo.outputPath('01-release-lobby.png'), fullPage: true })

  await createReleaseProject(page)
  await expect(page.getByRole('heading', { name: 'Agent正在理解不同区域。' })).toBeVisible()
  await expect(page.getByText('12 / 30+')).toBeVisible()
  await assertChildrenDoNotOverlap(page, '.regional-run-regions > article')
  await page.waitForTimeout(180)
  await page.screenshot({ path: testInfo.outputPath('02-regional-analysis.png'), fullPage: true })

  await page.evaluate(() => (globalThis as typeof globalThis & { __completeRehoyoResearch: () => void }).__completeRehoyoResearch())
  await expect(page.getByRole('heading', { name: '区域分析' })).toBeVisible()
  await expect(page.getByRole('button', { name: /日本/ })).toBeVisible()
  await assertChildrenDoNotOverlap(page, '.workspace-region-switcher > button')
  await page.waitForTimeout(180)
  await page.screenshot({ path: testInfo.outputPath('03-region-workspace.png'), fullPage: true })

  await page.getByRole('button', { name: '发行方案', exact: true }).click()
  await expect(page.getByRole('heading', { name: '发行方案' })).toBeVisible()
  await expect(page.locator('[data-testid="release-action-row"]')).toHaveCount(3)

  await page.getByRole('button', { name: 'AI角色执行' }).click()
  await expect(page.getByText('未连接真实玩家')).toBeVisible()
  await page.getByRole('button', { name: /生成待审草稿/ }).click()
  await page.getByRole('button', { name: /确认事实并批准/ }).click()
  await page.getByRole('button', { name: /启动沙盒执行/ }).click()
  await expect(page.getByText('沙盒运行中')).toBeVisible()
  await page.getByRole('button', { name: '暂停沙盒' }).click()
  await expect(page.getByText('已暂停', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止沙盒' }).click()
  await expect(page.getByText('已停止', { exact: true })).toBeVisible()
  await expect(page.getByText(/没有消息发送到真实玩家/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('04-character-sandbox.png'), fullPage: true })

  await page.getByRole('button', { name: '查看依据' }).click()
  await expect(page.locator('.research-coverage-summary').getByText('37', { exact: true })).toBeVisible()
  await expect(page.getByText('Brave · BigModel')).toBeVisible()
  await page.getByRole('button', { name: '打开常驻发行助手' }).click()
  await expect(page.getByRole('complementary', { name: '常驻发行助手' })).toBeVisible()
  await page.getByRole('button', { name: '证据还缺什么？' }).click()
  await expect(page.getByText(/可核验公开证据|没有可核验区域证据/)).toBeVisible()
  await expect(aaViolations(page)).resolves.toEqual([])
  expect(browserErrors).toEqual([])
})

test('keeps required version facts explicit before research starts', async ({ page }) => {
  await page.getByRole('button', { name: /创建版本发行项目/ }).click()
  await page.getByRole('button', { name: /开始区域研究/ }).click()
  await expect(page).toHaveURL(/projects\/new/)
  await expect(page.getByLabel('版本号')).toBeFocused()
})
