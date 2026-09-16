const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastAPI', {
  onShow: (callback) => ipcRenderer.on('show-toast', (_event, note) => callback(note)),
  click: () => ipcRenderer.send('toast-click'),
});
