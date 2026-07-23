export function createWindowOptions(preloadPath, iconPath) {
  return {
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#080a14',
    title: 'ReHoYo · 全球玩家洞察指挥中心',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  }
}

export function isAllowedNavigation(targetUrl, rendererUrl) {
  try {
    const target = new URL(targetUrl)
    const renderer = new URL(rendererUrl)

    if (renderer.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === renderer.pathname
    }

    return ['http:', 'https:'].includes(target.protocol) && target.origin === renderer.origin
  } catch {
    return false
  }
}
