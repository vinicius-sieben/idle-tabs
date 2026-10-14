const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  clearSession: (panelIndex) => ipcRenderer.invoke('session:clear', panelIndex),
  setAllowScripts: (value) => ipcRenderer.invoke('scripts:setAllow', value),
  setOpenLinksInNewWindow: (value) => ipcRenderer.invoke('links:setOpenInNewWindow', value),
  openCurrentWindow: (panelIndex) => ipcRenderer.invoke('windows:openCurrent', panelIndex),
  executeScript: (panelIndex, code) => ipcRenderer.invoke('automation:execute', panelIndex, code)
});
