import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testApiKey = 'electron-e2e-private-key'
const endpoint = 'https://open.bigmodel.cn/api/coding/paas/v4'

async function launchRehoyo(userDataPath: string) {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataPath}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      REHOYO_DISABLE_LOCAL_CONFIG: '1',
    },
  })
}

test('secures first-run credentials and restores the Electron connection', async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-electron-e2e-'))

  try {
    const firstLaunch = await launchRehoyo(userDataPath)
    try {
      const page = await firstLaunch.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      await expect(page).toHaveTitle('ReHoYo · 全球玩家洞察指挥中心')
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'ReHoYo' })).toBeVisible()
      await expect(page.getByLabel('API Endpoint')).toHaveValue(endpoint)

      await page.getByLabel('API Key').fill(testApiKey)
      await page.getByRole('button', { name: '连接并进入' }).click()
      await expect(page.getByRole('heading', { name: /听见全球玩家/ })).toBeVisible()

      const actualUserDataPath = await firstLaunch.evaluate(({ app }) => app.getPath('userData'))
      expect(path.resolve(actualUserDataPath)).toBe(path.resolve(userDataPath))
      const storedText = await readFile(path.join(actualUserDataPath, 'rehoyo-connection.json'), 'utf8')
      expect(storedText).not.toContain(testApiKey)
      expect(JSON.parse(storedText)).toMatchObject({
        version: 1,
        provider: 'bigmodel',
        endpoint,
        model: 'glm-5.2',
        encryptedApiKey: expect.any(String),
      })

      const connectionStatus = await page.evaluate(() => (
        globalThis as typeof globalThis & {
          rehoyoDesktop?: { connection?: { getStatus: () => Promise<unknown> } }
        }
      ).rehoyoDesktop?.connection?.getStatus())
      expect(connectionStatus).toEqual({
        configured: true,
        provider: 'bigmodel',
        endpoint,
        endpointHost: 'open.bigmodel.cn',
        model: 'glm-5.2',
        persistence: 'encrypted',
      })

      const opened = await page.evaluate(() => globalThis.open('https://example.com'))
      expect(opened).toBeNull()
      expect(firstLaunch.windows()).toHaveLength(1)
    } finally {
      await firstLaunch.close()
    }

    const secondLaunch = await launchRehoyo(userDataPath)
    try {
      const page = await secondLaunch.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByRole('heading', { name: /听见全球玩家/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toHaveCount(0)

      const cleared = await page.evaluate(() => (
        globalThis as typeof globalThis & {
          rehoyoDesktop?: { connection?: { clear: () => Promise<{ configured: false }> } }
        }
      ).rehoyoDesktop?.connection?.clear())
      expect(cleared).toEqual({ configured: false })
      await page.reload()
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
    } finally {
      await secondLaunch.close()
    }
  } finally {
    await rm(userDataPath, { recursive: true, force: true })
  }
})
