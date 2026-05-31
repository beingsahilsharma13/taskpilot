const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let mainWindow;
let db;
let taskQueue;
let aiEngine;
let whatsapp;
let emailService;
let webhookServer;

// ── Create the main window ────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f14',
    icon: path.join(__dirname, 'src/ui/assets/icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

// ── App init ──────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Lazy load backend modules after app is ready (so app.getPath works)
  db = require('./database/db');
  taskQueue = require('./src/backend/taskQueue');
  aiEngine = require('./src/backend/aiEngine');
  whatsapp = require('./src/backend/whatsapp');
  emailService = require('./src/backend/email');
  webhookServer = require('./src/webhook/server');

  // Start webhook server
  await webhookServer.startServer();

  // Init AI services from saved settings
  const settings = db.getAllSettings();
  if (settings.claudeApiKey || settings.openaiApiKey) {
    aiEngine.init(settings.claudeApiKey, settings.openaiApiKey);
  }
  if (settings.twilioSid && settings.twilioToken) {
    whatsapp.init(settings.twilioSid, settings.twilioToken, settings.twilioFrom, settings.whatsappTo);
  }
  if (settings.gmailUser && settings.gmailPass) {
    emailService.init(settings.gmailUser, settings.gmailPass, settings.emailTo);
  }

  // Forward queue events to renderer
  const queueEvents = [
    'task:started', 'task:response', 'task:done', 'task:failed',
    'task:waiting_confirm', 'task:skipped', 'task:modified',
    'list:started', 'list:completed', 'queue:paused', 'queue:resumed',
    'confirmation:received', 'error'
  ];
  queueEvents.forEach(event => {
    taskQueue.on(event, (data) => {
      if (mainWindow) mainWindow.webContents.send(event, data);
    });
  });

  const rateLimiter = require('./src/backend/rateLimiter');
  rateLimiter.on('limited', (data) => { if (mainWindow) mainWindow.webContents.send('rate:limited', data); });
  rateLimiter.on('resumed', (data) => { if (mainWindow) mainWindow.webContents.send('rate:resumed', data); });

  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (webhookServer) webhookServer.stopServer(); });

// ── IPC Handlers ──────────────────────────────────────────────

// DB: Lists
ipcMain.handle('db:getLists', () => db.getLists());
ipcMain.handle('db:getList', (_, id) => db.getList(id));
ipcMain.handle('db:createList', (_, name, description) => {
  const id = uuidv4();
  db.createList(id, name, description);
  return db.getList(id);
});
ipcMain.handle('db:deleteList', (_, id) => db.deleteList(id));

// DB: Tasks
ipcMain.handle('db:getTasksForList', (_, listId) => db.getTasksForList(listId));
ipcMain.handle('db:createTask', (_, task) => {
  const id = uuidv4();
  db.createTask({ ...task, id });
  return db.getTask(id);
});
ipcMain.handle('db:updateTask', (_, id, fields) => {
  db.updateTask(id, fields);
  return db.getTask(id);
});
ipcMain.handle('db:deleteTask', (_, id) => db.deleteTask(id));

// Queue
ipcMain.handle('queue:start', (_, listId) => {
  taskQueue.start(listId).catch(err => {
    if (mainWindow) mainWindow.webContents.send('error', { message: err.message });
  });
  return { started: true };
});
ipcMain.handle('queue:pause', () => { taskQueue.pause(); return { paused: true }; });
ipcMain.handle('queue:resume', () => { taskQueue.resume(); return { resumed: true }; });
ipcMain.handle('queue:stop', () => { taskQueue.stop(); return { stopped: true }; });
ipcMain.handle('queue:confirm', (_, action, instruction) => {
  taskQueue.handleIncomingMessage(action === 'modify' ? `MODIFY ${instruction}` : action.toUpperCase());
  return { ok: true };
});

// Settings
ipcMain.handle('settings:getAll', () => db.getAllSettings());
ipcMain.handle('settings:save', (_, key, value) => { db.setSetting(key, value); return { ok: true }; });
ipcMain.handle('settings:saveAll', (_, settings) => {
  Object.entries(settings).forEach(([k, v]) => db.setSetting(k, v));
  // Re-init services with new settings
  const s = db.getAllSettings();
  aiEngine.init(s.claudeApiKey, s.openaiApiKey);
  if (s.twilioSid && s.twilioToken) whatsapp.init(s.twilioSid, s.twilioToken, s.twilioFrom, s.whatsappTo);
  if (s.gmailUser && s.gmailPass) emailService.init(s.gmailUser, s.gmailPass, s.emailTo);
  return { ok: true };
});
