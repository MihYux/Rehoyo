const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('rehoyoDesktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
}))
