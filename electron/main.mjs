import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createWindowOptions, isAllowedNavigation } from './config.mjs'
import {
  createGlmRuntimeConfig,
  getPublicGlmStatus,
  readGlmLaunchEnvironment,
  requestGlmAdvisor,
  sanitizeGlmAdvisorRequest,
} from './glm-client.mjs'
import { runLiveResearch, sanitizeResearchRequest } from './research-client.mjs'

const electronDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(electronDirectory, '..')
const preloadPath = path.join(electronDirectory, 'preload.cjs')
const iconPath = path.join(appRoot, 'ReHoYo_Logo_Transparent.png')
const rendererFile = path.join(appRoot, 'dist', 'index.html')
const developmentUrl = process.env.VITE_DEV_SERVER_URL
const rendererUrl = developmentUrl || pathToFileURL(rendererFile).href

let glmConfig
try {
  const localConfigPath = path.join(appRoot, '.rehoyo-live.json')
  const localConfigDisabled = process.env.REHOYO_DISABLE_LOCAL_CONFIG === '1'
  const launchArguments = localConfigDisabled || process.argv.some((argument) => argument.startsWith('--rehoyo-glm-config=')) || !existsSync(localConfigPath)
    ? process.argv
    : [...process.argv, `--rehoyo-glm-config=${localConfigPath}`]
  glmConfig = createGlmRuntimeConfig({
    ...readGlmLaunchEnvironment(launchArguments),
    ...process.env,
  })
} catch (error) {
  console.error('GLM configuration disabled:', error instanceof Error ? error.message : 'invalid configuration')
  glmConfig = createGlmRuntimeConfig({}, () => false)
}

let mainWindow = null

ipcMain.handle('rehoyo:advisor:status', () => getPublicGlmStatus(glmConfig))
ipcMain.handle('rehoyo:advisor:ask', async (_event, input) => {
  try {
    const request = sanitizeGlmAdvisorRequest(input)
    const response = await requestGlmAdvisor({ config: glmConfig, request })
    return { ok: true, ...response }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GLM request failed.'
    return { ok: false, error: message.slice(0, 240) }
  }
})

const activeResearchRuns = new Set()

ipcMain.handle('rehoyo:research:status', () => ({
  configured: glmConfig.configured,
  model: glmConfig.model,
  retrieval: 'BigModel Web Search + Reddit RSS + Niconico Snapshot',
  searchEndpoint: new URL(glmConfig.searchBaseUrl).hostname,
}))

ipcMain.handle('rehoyo:research:run', async (event, input) => {
  const runId = String(input?.runId || '').slice(0, 160)
  if (!runId) return { ok: false, error: 'A research run id is required.' }
  if (activeResearchRuns.has(runId)) return { ok: false, error: 'This live research task is already running.' }

  activeResearchRuns.add(runId)
  try {
    const request = sanitizeResearchRequest(input)
    const preset = await runLiveResearch({
      config: glmConfig,
      request,
      onEvent: (researchEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('rehoyo:research:event', { runId, event: researchEvent })
        }
      },
    })
    return { ok: true, preset }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live research failed.'
    return { ok: false, error: message.slice(0, 300) }
  } finally {
    activeResearchRuns.delete(runId)
  }
})

async function createMainWindow() {
  const window = new BrowserWindow(createWindowOptions(preloadPath, iconPath))
  mainWindow = window
  window.removeMenu()

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, rendererUrl)) event.preventDefault()
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (developmentUrl) await window.loadURL(developmentUrl)
  else await window.loadFile(rendererFile)

  return window
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.whenReady().then(async () => {
  app.setAppUserModelId('com.rehoyo.player-intelligence')
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
