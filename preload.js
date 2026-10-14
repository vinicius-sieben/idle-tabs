const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  clearSession: (panelIndex) => ipcRenderer.invoke('session:clear', panelIndex),
  setAllowScripts: (value) => ipcRenderer.invoke('scripts:setAllow', value),
  setOpenLinksInNewWindow: (value) => ipcRenderer.invoke('links:setOpenInNewWindow', value),
  openCurrentWindow: (panelIndex) => ipcRenderer.invoke('windows:openCurrent', panelIndex),
  getExtensionStatus: () => ipcRenderer.invoke('extensions:status'),
  setExtensionEnabled: (value) => ipcRenderer.invoke('extensions:setEnabled', value),
  importExtensionFromChrome: () => ipcRenderer.invoke('extensions:importChrome'),
  selectExtensionFolder: () => ipcRenderer.invoke('extensions:selectFolder'),
  executeScript: (panelIndex, code) => ipcRenderer.invoke('automation:execute', panelIndex, code)
});
