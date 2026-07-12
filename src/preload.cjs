const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radar', {
  getData: () => ipcRenderer.invoke('get-data'),
  savePlayer: player => ipcRenderer.invoke('save-player', player),
  deletePlayer: id => ipcRenderer.invoke('delete-player', id),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  openRiotDocs: () => ipcRenderer.invoke('open-riot-docs'),
  onLeagueStatus: callback => ipcRenderer.on('league-status', (_event, status) => callback(status)),
  onDataChanged: callback => ipcRenderer.on('data-changed', (_event, data) => callback(data)),
  onFocusAdd: callback => ipcRenderer.on('focus-add', callback)
});
