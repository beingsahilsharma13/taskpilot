const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  login: () => ipcRenderer.invoke('login'),
  run: (tasks) => ipcRenderer.invoke('run', tasks),
  stop: () => ipcRenderer.invoke('stop'),
  onLog: (cb) => ipcRenderer.on('log', (_, d) => cb(d)),
  onFinished: (cb) => ipcRenderer.on('finished', (_, d) => cb(d)),
});
