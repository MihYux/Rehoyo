const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rehoyoDesktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  advisor: Object.freeze({
    getStatus: () => ipcRenderer.invoke('rehoyo:advisor:status'),
    ask: (request) => ipcRenderer.invoke('rehoyo:advisor:ask', request),
  }),
  research: Object.freeze({
    getStatus: () => ipcRenderer.invoke('rehoyo:research:status'),
    run: (request) => ipcRenderer.invoke('rehoyo:research:run', request),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {}
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('rehoyo:research:event', handler)
      return () => ipcRenderer.removeListener('rehoyo:research:event', handler)
    },
  }),
}))
