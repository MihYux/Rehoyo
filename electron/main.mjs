import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BIGMODEL_CODING_ENDPOINT,
  BIGMODEL_SEARCH_ENDPOINT,
  DEFAULT_GLM_MODEL,
  createConnectionManager,
} from './connection-manager.mjs'
import { createWindowOptions, isAllowedNavigation } from './config.mjs'
import {
  createGlmRuntimeConfig,
  getPublicGlmStatus,
  readGlmLaunchEnvironment,
  requestGlmAdvisor,
  sanitizeGlmAdvisorRequest,
  streamGlmAdvisor,
} from './glm-client.mjs'
import { runLiveResearch, sanitizeResearchRequest } from './research-client.mjs'
import { createHeadlessResearchBrowser } from './headless-research-browser.mjs'
import { createLocalRagStore } from './local-rag-store.mjs'

const electronDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(electronDirectory, '..')
const preloadPath = path.join(electronDirectory, 'preload.cjs')
const iconPath = path.join(appRoot, 'ReHoYo_Logo_Transparent.png')
const rendererFile = path.join(appRoot, 'dist', 'index.html')
const developmentUrl = process.env.VITE_DEV_SERVER_URL
const rendererUrl = developmentUrl || pathToFileURL(rendererFile).href

let launchGlmConfig
try {
  launchGlmConfig = createGlmRuntimeConfig({
    ...readGlmLaunchEnvironment(process.argv),
    ...process.env,
  })
} catch (error) {
  console.error('GLM configuration disabled:', error instanceof Error ? error.message : 'invalid configuration')
  launchGlmConfig = createGlmRuntimeConfig({}, () => false)
}

let mainWindow = null
let connectionManager = null
let localRagStore = null
let ipcRegistered = false
const activeAdvisorStreams = new Map()
const activeResearchRuns = new Set()

function advisorStreamKey(senderId, requestId) {
  return `${senderId}:${requestId}`
}

function sendAdvisorEvent(sender, payload) {
  if (!sender.isDestroyed()) sender.send('rehoyo:advisor:event', payload)
}

function currentGlmConfig() {
  const status = connectionManager?.getStatus()
  return Object.freeze({
    baseUrl: BIGMODEL_CODING_ENDPOINT,
    searchBaseUrl: BIGMODEL_SEARCH_ENDPOINT,
    model: status?.model || launchGlmConfig.model || DEFAULT_GLM_MODEL,
    keyFile: '',
    configured: Boolean(status?.configured),
  })
}

function registerIpcHandlers() {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('rehoyo:connection:status', () => connectionManager.getStatus())
  ipcMain.handle('rehoyo:connection:save', async (_event, input) => connectionManager.save(input))
  ipcMain.handle('rehoyo:connection:clear', async () => connectionManager.clear())

  ipcMain.handle('rehoyo:advisor:status', () => getPublicGlmStatus(currentGlmConfig()))
  ipcMain.handle('rehoyo:advisor:ask', async (_event, input) => {
    try {
      const request = sanitizeGlmAdvisorRequest(input)
      const response = await requestGlmAdvisor({
        config: currentGlmConfig(),
        request,
        getApiKey: () => connectionManager.getApiKey(),
      })
      return { ok: true, ...response }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GLM request failed.'
      return { ok: false, error: message.slice(0, 240) }
    }
  })
  ipcMain.handle('rehoyo:advisor:stream', async (event, input) => {
    const requestId = String(input?.requestId || '').trim().slice(0, 160)
    if (!requestId) return { ok: false, error: 'An advisor request id is required.' }

    const key = advisorStreamKey(event.sender.id, requestId)
    if (activeAdvisorStreams.has(key)) {
      return { ok: false, error: 'This advisor request is already streaming.' }
    }

    let request
    try {
      request = sanitizeGlmAdvisorRequest(input?.request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid advisor request.'
      return { ok: false, error: message.slice(0, 240) }
    }

    const controller = new AbortController()
    const handleDestroyed = () => controller.abort(new DOMException('Advisor window closed.', 'AbortError'))
    activeAdvisorStreams.set(key, controller)
    event.sender.once('destroyed', handleDestroyed)
    sendAdvisorEvent(event.sender, {
      requestId,
      type: 'start',
      model: currentGlmConfig().model,
    })

    try {
      const response = await streamGlmAdvisor({
        config: currentGlmConfig(),
        request,
        getApiKey: () => connectionManager.getApiKey(),
        signal: controller.signal,
        onEvent: ({ content }) => sendAdvisorEvent(event.sender, {
          requestId,
          type: 'delta',
          content,
        }),
      })
      sendAdvisorEvent(event.sender, {
        requestId,
        type: 'complete',
        model: response.model,
      })
      return { ok: true, ...response }
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      const message = cancelled
        ? 'Advisor generation stopped.'
        : error instanceof Error ? error.message : 'GLM request failed.'
      sendAdvisorEvent(event.sender, {
        requestId,
        type: cancelled ? 'cancelled' : 'error',
        error: message.slice(0, 240),
      })
      return { ok: false, error: message.slice(0, 240), cancelled }
    } finally {
      activeAdvisorStreams.delete(key)
      event.sender.removeListener('destroyed', handleDestroyed)
    }
  })
  ipcMain.handle('rehoyo:advisor:cancel', (event, requestIdValue) => {
    const requestId = String(requestIdValue || '').trim().slice(0, 160)
    const controller = activeAdvisorStreams.get(advisorStreamKey(event.sender.id, requestId))
    if (!controller) return { ok: false, error: 'Advisor request is not active.' }
    controller.abort(new DOMException('Stopped by user.', 'AbortError'))
    return { ok: true }
  })

  ipcMain.handle('rehoyo:research:status', () => {
    const config = currentGlmConfig()
    return {
      configured: config.configured,
      model: config.model,
      retrieval: '37 个公开站点 · 13 组地域检索 · Reddit / Niconico',
      searchEndpoint: new URL(config.searchBaseUrl).hostname,
    }
  })

  ipcMain.handle('rehoyo:research:run', async (event, input) => {
    const runId = String(input?.runId || '').slice(0, 160)
    if (!runId) return { ok: false, error: 'A research run id is required.' }
    if (activeResearchRuns.has(runId)) return { ok: false, error: 'This live research task is already running.' }

    activeResearchRuns.add(runId)
    try {
      const request = sanitizeResearchRequest(input)
      const preset = await runLiveResearch({
        config: currentGlmConfig(),
        request,
        getApiKey: () => connectionManager.getApiKey(),
        runSeed: runId,
        ragStore: localRagStore,
        createResearchBrowser: (options) => createHeadlessResearchBrowser(options),
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
}

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
  connectionManager = createConnectionManager({
    userDataPath: app.getPath('userData'),
    safeStorage,
    externalConfig: launchGlmConfig,
    externalGetApiKey: launchGlmConfig.configured
      ? () => readFile(launchGlmConfig.keyFile, 'utf8')
      : undefined,
  })
  await connectionManager.initialize()
  localRagStore = createLocalRagStore({ dbPath: path.join(app.getPath('userData'), 'rehoyo-research.sqlite') })
  registerIpcHandlers()
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  localRagStore?.close()
  localRagStore = null
})
