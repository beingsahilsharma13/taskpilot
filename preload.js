const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to the renderer (UI) process
// This is the bridge between the UI and the Node.js backend
contextBridge.exposeInMainWorld('taskpilot', {
  // ── Task Lists ───────────────────────────────────────────
  getLists: () => ipcRenderer.invoke('db:getLists'),
  createList: (name, description) => ipcRenderer.invoke('db:createList', name, description),
  deleteList: (id) => ipcRenderer.invoke('db:deleteList', id),
  getList: (id) => ipcRenderer.invoke('db:getList', id),

  // ── Tasks ────────────────────────────────────────────────
  getTasksForList: (listId) => ipcRenderer.invoke('db:getTasksForList', listId),
  createTask: (task) => ipcRenderer.invoke('db:createTask', task),
  updateTask: (id, fields) => ipcRenderer.invoke('db:updateTask', id, fields),
  deleteTask: (id) => ipcRenderer.invoke('db:deleteTask', id),

  // ── Queue Engine ─────────────────────────────────────────
  startQueue: (listId) => ipcRenderer.invoke('queue:start', listId),
  pauseQueue: () => ipcRenderer.invoke('queue:pause'),
  resumeQueue: () => ipcRenderer.invoke('queue:resume'),
  stopQueue: () => ipcRenderer.invoke('queue:stop'),
  sendConfirmation: (action, instruction) => ipcRenderer.invoke('queue:confirm', action, instruction),
  submitBrowserResponse: (response) => ipcRenderer.invoke('queue:browserResponse', response),
  cancelBrowserTask: () => ipcRenderer.invoke('queue:browserCancel'),

  // ── Chat (Claude Fable 5 / ChatGPT) ─────────────────────────
  chatSend: (provider, messages) => ipcRenderer.invoke('chat:send', provider, messages),

  // ── Settings ─────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  saveSetting: (key, value) => ipcRenderer.invoke('settings:save', key, value),
  saveAllSettings: (settings) => ipcRenderer.invoke('settings:saveAll', settings),

  // ── Events from backend → UI ─────────────────────────────
  on: (channel, callback) => {
    const validChannels = [
      'task:started', 'task:response', 'task:waiting', 'task:done', 'task:failed',
      'task:skipped', 'task:modified', 'task:browser_waiting',
      'list:started', 'list:completed',
      'queue:paused', 'queue:resumed', 'queue:stopped', 'queue:warn', 'queue:error',
      'rate:limited', 'rate:resumed',
      'confirmation', 'error'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => callback(data));
    }
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});
