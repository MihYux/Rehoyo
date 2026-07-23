export interface ElectronWindowOptions {
  width: number
  height: number
  minWidth: number
  minHeight: number
  show: boolean
  autoHideMenuBar: boolean
  backgroundColor: string
  title: string
  icon: string
  webPreferences: {
    preload: string
    contextIsolation: boolean
    nodeIntegration: boolean
    sandbox: boolean
    webSecurity: boolean
    allowRunningInsecureContent: boolean
  }
}

export function createWindowOptions(preloadPath: string, iconPath: string): ElectronWindowOptions
export function isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean
