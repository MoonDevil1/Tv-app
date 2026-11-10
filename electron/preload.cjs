const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tvApp', {
  loadPlaylist: () => ipcRenderer.invoke('playlist:load')
});
