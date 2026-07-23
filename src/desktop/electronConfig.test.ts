import manifest from '../../package.json'
import * as desktopConfig from '../../electron/config.mjs'
import { describe, expect, it } from 'vitest'

describe('Electron desktop shell', () => {
  it('declares Electron as the default application entry point', () => {
    const desktopManifest = manifest as typeof manifest & {
      main?: string
      scripts: Record<string, string>
      build?: { productName?: string }
    }

    expect(desktopManifest.main).toBe('electron/main.mjs')
    expect(desktopManifest.scripts.dev).toContain('electron')
    expect(desktopManifest.scripts['dev:renderer']).toContain('vite')
    expect(desktopManifest.build?.productName).toBe('ReHoYo')
  })

  it('uses isolated renderer defaults and blocks external navigation', async () => {
    const options = desktopConfig.createWindowOptions('C:/app/preload.cjs', 'C:/app/icon.png')
    expect(options).toMatchObject({
      width: 1600,
      height: 1000,
      minWidth: 1280,
      minHeight: 720,
      show: false,
      backgroundColor: '#080a14',
      icon: 'C:/app/icon.png',
    })
    expect(options.webPreferences).toMatchObject({
      preload: 'C:/app/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    })

    expect(desktopConfig.isAllowedNavigation('http://127.0.0.1:5173/assets/app.js', 'http://127.0.0.1:5173')).toBe(true)
    expect(desktopConfig.isAllowedNavigation('https://example.com', 'http://127.0.0.1:5173')).toBe(false)
    expect(desktopConfig.isAllowedNavigation('javascript:alert(1)', 'file:///C:/app/dist/index.html')).toBe(false)
  })
})
