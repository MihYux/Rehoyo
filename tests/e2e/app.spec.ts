import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createGroundedTestPreset } from '../../src/test/groundedFixture'

async function aaViolations(page: Page) {
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return audit.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    nodes: nodes.map((node) => node.target.join(' ')),
  }))
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
        advisor: {
          getStatus: async () => ({ configured: false, endpoint: 'open.bigmodel.cn', model: 'glm-5.2' }),
          ask: async () => ({ ok: false, error: 'E2E uses the local real-evidence answer.' }),
        },
        research: {
          getStatus: async () => ({ configured: true, model: 'glm-5.2', retrieval: 'E2E verified HTTPS fixture', searchEndpoint: 'open.bigmodel.cn' }),
          onEvent: (listener: (payload: unknown) => void) => {
            listeners.push(listener)
            return () => {
              const index = listeners.indexOf(listener)
              if (index >= 0) listeners.splice(index, 1)
            }
          },
          run: async (request: { runId: string; gameName: string; versionLabel: string; versionTitle: string }) => {
            const resultPreset = {
              ...preset,
              id: `live-e2e-${encodeURIComponent(request.gameName)}`,
              game: { ...preset.game, id: 'live-e2e-game', name: request.gameName },
              version: { ...preset.version, id: 'live-e2e-version', label: request.versionLabel, title: request.versionTitle },
            }
            const sourceEvent = { ...resultPreset.events[1], evidenceRecords: resultPreset.evidence }
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

test('runs the complete evidence-grounded desktop workflow', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await expect(page.getByRole('heading', { name: /听见全球玩家/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'ReHoYo' })).toBeVisible()
  const lobbyTitleBox = await page.getByRole('heading', { name: /听见全球玩家/ }).boundingBox()
  const agentTeamBox = await page.locator('#agent-team').boundingBox()
  expect(lobbyTitleBox).not.toBeNull()
  expect(agentTeamBox).not.toBeNull()
  expect(lobbyTitleBox!.height).toBeLessThan(170)
  expect(lobbyTitleBox!.x + lobbyTitleBox!.width).toBeLessThanOrEqual(agentTeamBox!.x)
  expect(await aaViolations(page)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('01-lobby.png'), fullPage: true })

  await page.getByRole('button', { name: /启动真实研究/ }).click()
  await expect(page.getByRole('heading', { name: 'Agent 协作空间' })).toBeVisible()
  const browserCards = page.getByRole('button', { name: /Agent 迷你浏览器/ })
  await expect(browserCards).toHaveCount(4)
  const browserCardBoxes = await browserCards.evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }))
  for (let first = 0; first < browserCardBoxes.length; first += 1) {
    for (let second = first + 1; second < browserCardBoxes.length; second += 1) {
      const a = browserCardBoxes[first]
      const b = browserCardBoxes[second]
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y
      expect(overlaps).toBe(false)
    }
  }
  await page.getByRole('button', { name: /地区差异 Agent/ }).click()
  await expect(page.getByRole('heading', { name: 'Agent 任务检查器' })).toBeVisible()
  await expect(page.getByText('任务目标', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('02-workspace.png'), fullPage: true })
  await page.evaluate(() => (globalThis as typeof globalThis & { __completeRehoyoResearch: () => void }).__completeRehoyoResearch())

  await expect(page.getByRole('heading', { name: '全球玩家洞察报告' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/report\?tab=overview/)
  expect(await aaViolations(page)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('03-report-overview.png'), fullPage: true })

  await page.getByRole('tab', { name: '地区差异' }).click()
  await expect(page).toHaveURL(/tab=regions/)
  await expect(page.getByText('地区证据覆盖与情绪构成')).toBeVisible()

  await page.getByRole('tab', { name: '争议与证据' }).click()
  await page.getByLabel('地区筛选').selectOption('JP')
  await expect(page.locator('.evidence-grid > article')).toHaveCount(1)

  await page.getByRole('button', { name: /打开 AI 游戏顾问/ }).click()
  await expect(page.getByRole('heading', { name: '版本决策顾问' })).toBeVisible()
  const firstQuestion = page.locator('.suggested-questions button').first()
  await firstQuestion.click()
  await expect(page.getByText('引用证据', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('04-advisor.png'), fullPage: true })

  await page.locator('.advisor-answer footer button').first().click()
  await expect(page).toHaveURL(/\/report\?tab=controversies&evidence=[^&]+/)
  await expect(page.locator('.evidence-grid > article.is-highlighted')).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.locator(':focus-visible')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('creates a custom task only after required fields are entered', async ({ page }) => {
  await page.getByRole('button', { name: /自定义游戏/ }).click()
  const launchButton = page.getByRole('button', { name: /启动真实研究/ })
  await expect(launchButton).toBeDisabled()
  await page.getByLabel('游戏名称').fill('Project Aurora')
  await page.getByLabel('版本或更新内容').fill('Season Zero')
  await expect(launchButton).toBeEnabled()
  await launchButton.click()
  await expect(page.getByText('自定义研究目标')).toBeVisible()
  await expect(page.getByText(/Project Aurora/)).toBeVisible()
})
