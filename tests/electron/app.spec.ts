import { _electron as electron, expect, test } from '@playwright/test'

test('launches ReHoYo in a secured Electron window', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  })

  try {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveTitle('ReHoYo · 全球玩家洞察指挥中心')
    await expect(page.getByRole('heading', { name: /听见全球玩家/ })).toBeVisible()
    await expect(page.getByRole('img', { name: 'ReHoYo' })).toBeVisible()

    const desktopBridge = await page.evaluate(() => (
      globalThis as typeof globalThis & { rehoyoDesktop?: { isElectron: boolean; platform: string } }
    ).rehoyoDesktop)
    expect(desktopBridge).toMatchObject({ isElectron: true, platform: 'win32' })

    const opened = await page.evaluate(() => globalThis.open('https://example.com'))
    expect(opened).toBeNull()
    expect(electronApp.windows()).toHaveLength(1)
  } finally {
    await electronApp.close()
  }
})
