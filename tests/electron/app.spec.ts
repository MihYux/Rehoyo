import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const aiApiKey = 'electron-e2e-private-ai-key'
const searchApiKey = 'electron-e2e-private-search-key'
const aiEndpoint = 'https://open.bigmodel.cn/api/coding/paas/v4'
const searchEndpoint = 'https://api.openai.com/v1'

async function launchRehoyo(userDataPath: string) {
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataPath}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      REHOYO_BIGMODEL_API_KEY: '',
      REHOYO_OPENAI_API_KEY: '',
      REHOYO_GLM_API_KEY_FILE: '',
    },
  })
}

test('secures, restores, and independently invalidates both Electron connections', async () => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'rehoyo-electron-e2e-'))

  try {
    const firstLaunch = await launchRehoyo(userDataPath)
    try {
      const page = await firstLaunch.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      await expect(page).toHaveTitle(/ReHoYo/)
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'ReHoYo' })).toBeVisible()
      await expect(page.getByLabel('BigModel Endpoint')).toHaveValue(aiEndpoint)
      await expect(page.getByLabel('OpenAI Endpoint')).toHaveValue(searchEndpoint)

      await page.getByLabel('BigModel API Key').fill(aiApiKey)
      await page.getByLabel('OpenAI API Key').fill(searchApiKey)
      await page.getByRole('button', { name: '安全连接并进入' }).click()
      await expect(page.getByRole('heading', { name: /从看见全球玩家/ })).toBeVisible()

      const actualUserDataPath = await firstLaunch.evaluate(({ app }) => app.getPath('userData'))
      expect(path.resolve(actualUserDataPath)).toBe(path.resolve(userDataPath))
      const storedText = await readFile(path.join(actualUserDataPath, 'rehoyo-connection.json'), 'utf8')
      expect(storedText).not.toContain(aiApiKey)
      expect(storedText).not.toContain(searchApiKey)
      expect(JSON.parse(storedText)).toMatchObject({
        version: 2,
        connections: {
          ai: { provider: 'bigmodel', endpoint: aiEndpoint, model: 'glm-5.2', encryptedApiKey: expect.any(String) },
          search: { provider: 'openai', endpoint: searchEndpoint, model: 'gpt-5.6', encryptedApiKey: expect.any(String) },
        },
      })

      const connectionStatus = await page.evaluate(() => (
        globalThis as typeof globalThis & {
          rehoyoDesktop?: { connection?: { getStatus: () => Promise<unknown> } }
        }
      ).rehoyoDesktop?.connection?.getStatus())
      expect(connectionStatus).toMatchObject({
        configured: true,
        ai: { configured: true, provider: 'bigmodel', persistence: 'encrypted' },
        search: { configured: true, provider: 'openai', persistence: 'encrypted' },
        missing: [],
      })
      expect(JSON.stringify(connectionStatus)).not.toContain(aiApiKey)
      expect(JSON.stringify(connectionStatus)).not.toContain(searchApiKey)

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

      await expect(page.getByRole('heading', { name: /从看见全球玩家/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toHaveCount(0)

      const invalidated = await page.evaluate(() => (
        globalThis as typeof globalThis & {
          rehoyoDesktop?: { connection?: { invalidate: (provider: string) => Promise<unknown> } }
        }
      ).rehoyoDesktop?.connection?.invalidate('search'))
      expect(invalidated).toMatchObject({
        configured: false,
        ai: { configured: true },
        search: { configured: false },
        missing: ['search.apiKey'],
      })

      await page.reload()
      await expect(page.getByRole('heading', { name: '连接 ReHoYo' })).toBeVisible()
      await expect(page.getByLabel('OpenAI API Key')).toBeVisible()
      await expect(page.getByLabel('BigModel API Key')).toHaveCount(0)
    } finally {
      await secondLaunch.close()
    }
  } finally {
    await rm(userDataPath, { recursive: true, force: true })
  }
})
