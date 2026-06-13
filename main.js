const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;
let worker = null;

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const SESSION_DIR = () => path.join(app.getPath('userData'), 'claude-session');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')); }
  catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2));
}

function createWindow() {
  win = new BrowserWindow({
    width: 880, height: 760, minWidth: 640, minHeight: 560,
    backgroundColor: '#0f0f14',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src/ui/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (worker) try { worker.kill(); } catch {} });

// ── IPC ──
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => { saveConfig(cfg); return { ok: true }; });

function runWorker(mode, tasks) {
  if (worker) return { error: 'Already running' };
  const cfg = loadConfig();
  const payload = { mode, tasks: tasks || [], config: cfg, userDataDir: SESSION_DIR() };

  const tmp = path.join(app.getPath('userData'), 'run.json');
  fs.writeFileSync(tmp, JSON.stringify(payload));

  // Run the Playwright worker using Electron's bundled Node (no external node needed)
  worker = spawn(process.execPath, [path.join(__dirname, 'src/worker.js'), tmp], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  let buf = '';
  worker.stdout.on('data', d => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.startsWith('LOG::')) {
        try { win.webContents.send('log', JSON.parse(line.slice(5))); } catch {}
      } else if (line.trim()) {
        win.webContents.send('log', { type: 'info', msg: line.trim() });
      }
    }
  });
  worker.stderr.on('data', d => {
    win.webContents.send('log', { type: 'error', msg: d.toString().trim() });
  });
  worker.on('close', code => {
    win.webContents.send('log', { type: 'closed', msg: `Worker finished (code ${code})` });
    win.webContents.send('finished', { code });
    worker = null;
  });
  return { ok: true };
}

ipcMain.handle('login', () => runWorker('login-only', []));
ipcMain.handle('run', (_, tasks) => runWorker('run', tasks));
ipcMain.handle('stop', () => { if (worker) { try { worker.kill(); } catch {} worker = null; } return { ok: true }; });
