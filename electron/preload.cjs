const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rehoyoDesktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  connection: Object.freeze({
    getStatus: () => ipcRenderer.invoke('rehoyo:connection:status'),
    save: (input) => ipcRenderer.invoke('rehoyo:connection:save', input),
    clear: (provider) => ipcRenderer.invoke('rehoyo:connection:clear', provider),
    invalidate: (provider) => ipcRenderer.invoke('rehoyo:connection:invalidate', provider),
    onStatus: (listener) => {
      if (typeof listener !== 'function') return () => {}
      const handler = (_event, status) => listener(status)
      ipcRenderer.on('rehoyo:connection:status-changed', handler)
      return () => ipcRenderer.removeListener('rehoyo:connection:status-changed', handler)
    },
  }),
  advisor: Object.freeze({
    getStatus: () => ipcRenderer.invoke('rehoyo:advisor:status'),
    ask: (request) => ipcRenderer.invoke('rehoyo:advisor:ask', request),
    stream: (request) => ipcRenderer.invoke('rehoyo:advisor:stream', request),
    cancel: (requestId) => ipcRenderer.invoke('rehoyo:advisor:cancel', requestId),
    onEvent: (listener) => {
      if (typeof listener !== 'function') return () => {}
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('rehoyo:advisor:event', handler)
      return () => ipcRenderer.removeListener('rehoyo:advisor:event', handler)
    },
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
