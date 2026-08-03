const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  showSaveDialog: (options) => ipcRenderer.invoke('save-dialog', options),
});
