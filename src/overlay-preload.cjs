const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onShowAlert: callback => ipcRenderer.on('show-alert', (_event, match) => callback(match))
});
