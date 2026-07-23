const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rehoyoDesktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  advisor: Object.freeze({
    getStatus: () => ipcRenderer.invoke('rehoyo:advisor:status'),
    ask: (request) => ipcRenderer.invoke('rehoyo:advisor:ask', request),
  }),
}))
