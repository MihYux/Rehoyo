import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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
  expect(await aaViolations(page)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('01-lobby.png'), fullPage: true })

  await page.getByRole('button', { name: /启动全球分析/ }).click()
  await expect(page.getByRole('heading', { name: 'Agent 协作空间' })).toBeVisible()
  await page.getByRole('button', { name: /地区差异 Agent/ }).click()
  await expect(page.getByRole('heading', { name: 'Agent 任务检查器' })).toBeVisible()
  await expect(page.getByText('任务目标', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('02-workspace.png'), fullPage: true })

  await expect(page.getByRole('heading', { name: '全球玩家洞察报告' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/report\?tab=overview/)
  expect(await aaViolations(page)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('03-report-overview.png'), fullPage: true })

  await page.getByRole('tab', { name: '地区差异' }).click()
  await expect(page).toHaveURL(/tab=regions/)
  await expect(page.getByText('地区关注点对照')).toBeVisible()

  await page.getByRole('tab', { name: '争议与证据' }).click()
  await page.getByLabel('地区筛选').selectOption('JP')
  await expect(page.locator('.evidence-grid > article')).toHaveCount(3)

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
  const launchButton = page.getByRole('button', { name: /启动全球分析/ })
  await expect(launchButton).toBeDisabled()
  await page.getByLabel('游戏名称').fill('Project Aurora')
  await page.getByLabel('版本或更新内容').fill('Season Zero')
  await expect(launchButton).toBeEnabled()
  await launchButton.click()
  await expect(page.getByText('通用演示模板')).toBeVisible()
  await expect(page.getByText(/Project Aurora/)).toBeVisible()
})
