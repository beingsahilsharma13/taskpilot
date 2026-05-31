const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// Store DB in user's app data directory so it persists across updates
const dbPath = app
  ? path.join(app.getPath('userData'), 'taskpilot.db')
  : path.join(__dirname, 'taskpilot.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ── Create tables ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS task_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'idle',     -- idle | running | paused | completed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    position INTEGER NOT NULL,       -- order in the list (1, 2, 3...)
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,            -- the prompt to send to AI
    ai_provider TEXT DEFAULT 'claude', -- 'claude' | 'openai'
    ai_model TEXT,                   -- e.g. 'claude-opus-4-20250514' or 'gpt-4o'
    use_prev_context INTEGER DEFAULT 0, -- 1 = pass previous task response as context
    status TEXT DEFAULT 'pending',   -- pending | running | waiting_confirm | done | skipped | failed
    ai_response TEXT,                -- what the AI returned
    user_modification TEXT,          -- if user said MODIFY, what they said
    notify_channel TEXT DEFAULT 'whatsapp', -- 'whatsapp' | 'email'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(list_id) REFERENCES task_lists(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS run_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Helper functions ──────────────────────────────────────────

const dbHelpers = {
  // Task Lists
  createList: (id, name, description) => {
    return db.prepare(
      'INSERT INTO task_lists (id, name, description) VALUES (?, ?, ?)'
    ).run(id, name, description);
  },

  getLists: () => db.prepare('SELECT * FROM task_lists ORDER BY created_at DESC').all(),

  getList: (id) => db.prepare('SELECT * FROM task_lists WHERE id = ?').get(id),

  updateListStatus: (id, status) => {
    return db.prepare(
      'UPDATE task_lists SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
  },

  deleteList: (id) => {
    db.prepare('DELETE FROM tasks WHERE list_id = ?').run(id);
    return db.prepare('DELETE FROM task_lists WHERE id = ?').run(id);
  },

  // Tasks
  createTask: (task) => {
    return db.prepare(`
      INSERT INTO tasks (id, list_id, position, title, prompt, ai_provider, ai_model, use_prev_context, notify_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.listId, task.position, task.title,
      task.prompt, task.aiProvider || 'claude', task.aiModel || null,
      task.usePrevContext ? 1 : 0, task.notifyChannel || 'whatsapp'
    );
  },

  getTasksForList: (listId) => {
    return db.prepare(
      'SELECT * FROM tasks WHERE list_id = ? ORDER BY position ASC'
    ).all(listId);
  },

  getTask: (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id),

  getNextPendingTask: (listId) => {
    return db.prepare(
      "SELECT * FROM tasks WHERE list_id = ? AND status = 'pending' ORDER BY position ASC LIMIT 1"
    ).get(listId);
  },

  updateTaskStatus: (id, status, response = null) => {
    return db.prepare(`
      UPDATE tasks SET status = ?, ai_response = COALESCE(?, ai_response), updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, response, id);
  },

  updateTask: (id, fields) => {
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(fields), id];
    return db.prepare(
      `UPDATE tasks SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...values);
  },

  deleteTask: (id) => db.prepare('DELETE FROM tasks WHERE id = ?').run(id),

  // Settings
  getSetting: (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  setSetting: (key, value) => {
    return db.prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(key, value);
  },

  getAllSettings: () => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
  },

  // Logs
  log: (taskId, event, detail = null) => {
    const { v4: uuidv4 } = require('uuid');
    return db.prepare(
      'INSERT INTO run_logs (id, task_id, event, detail) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), taskId, event, detail);
  },

  getLogsForTask: (taskId) => {
    return db.prepare(
      'SELECT * FROM run_logs WHERE task_id = ? ORDER BY created_at DESC'
    ).all(taskId);
  }
};

module.exports = { db, ...dbHelpers };
