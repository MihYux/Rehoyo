import { app, BrowserWindow, ipcMain } from 'electron'
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

const electronDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(electronDirectory, '..')
const preloadPath = path.join(electronDirectory, 'preload.cjs')
const iconPath = path.join(appRoot, 'ReHoYo_Logo_Transparent.png')
const rendererFile = path.join(appRoot, 'dist', 'index.html')
const developmentUrl = process.env.VITE_DEV_SERVER_URL
const rendererUrl = developmentUrl || pathToFileURL(rendererFile).href

let glmConfig
try {
  glmConfig = createGlmRuntimeConfig({
    ...readGlmLaunchEnvironment(process.argv),
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
