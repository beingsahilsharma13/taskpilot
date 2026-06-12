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

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    prompt TEXT,
    ai_response TEXT,
    ai_provider TEXT,
    duration_ms INTEGER,
    status TEXT,
    error TEXT,
    delivery_status TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS delivery_logs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    mode TEXT,
    status TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(execution_id) REFERENCES executions(id)
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id TEXT PRIMARY KEY,
    level TEXT,
    service TEXT,
    message TEXT,
    stacktrace TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Migrations (safe to run on every start) ──────────────────
// Adds exec_mode column: 'api' (automatic) | 'browser' (visual)
try { db.exec("ALTER TABLE tasks ADD COLUMN exec_mode TEXT DEFAULT 'api'"); }
catch (e) { /* column already exists — fine */ }

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
      INSERT INTO tasks (id, list_id, position, title, prompt, ai_provider, ai_model, use_prev_context, notify_channel, exec_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.listId, task.position, task.title,
      task.prompt, task.aiProvider || 'claude', task.aiModel || null,
      task.usePrevContext ? 1 : 0, task.notifyChannel || 'whatsapp',
      task.execMode || 'api'
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
  },

  // Execution history
  logExecution: (execution) => {
    const { v4: uuidv4 } = require('uuid');
    return db.prepare(`
      INSERT INTO executions (id, task_id, prompt, ai_response, ai_provider, duration_ms, status, error, delivery_status, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      execution.id || uuidv4(),
      execution.taskId,
      execution.prompt,
      execution.aiResponse,
      execution.aiProvider,
      execution.duration,
      execution.status,
      execution.error || null,
      JSON.stringify(execution.deliveryStatus || {}),
      execution.executedAt || new Date().toISOString()
    );
  },

  getExecutionHistory: (taskId, limit = 10) => {
    return db.prepare(
      'SELECT * FROM executions WHERE task_id = ? ORDER BY executed_at DESC LIMIT ?'
    ).all(taskId, limit);
  },

  getAllExecutions: (limit = 100) => {
    return db.prepare(
      'SELECT * FROM executions ORDER BY executed_at DESC LIMIT ?'
    ).all(limit);
  },

  logDelivery: (executionId, mode, status, message) => {
    const { v4: uuidv4 } = require('uuid');
    return db.prepare(`
      INSERT INTO delivery_logs (id, execution_id, mode, status, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), executionId, mode, status, message);
  },

  getDeliveryStatus: (executionId) => {
    return db.prepare(
      'SELECT * FROM delivery_logs WHERE execution_id = ? ORDER BY created_at ASC'
    ).all(executionId);
  },

  // System logging
  logSystem: (level, service, message, stacktrace = null) => {
    const { v4: uuidv4 } = require('uuid');
    return db.prepare(`
      INSERT INTO system_logs (id, level, service, message, stacktrace)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), level, service, message, stacktrace);
  },

  getSystemLogs: (limit = 100, level = null) => {
    if (level) {
      return db.prepare(
        'SELECT * FROM system_logs WHERE level = ? ORDER BY created_at DESC LIMIT ?'
      ).all(level, limit);
    }
    return db.prepare(
      'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  },

  // Dashboard stats
  getStats: () => {
    const tasks = db.prepare('SELECT COUNT(*) as total FROM tasks').get();
    const running = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'running'").get();
    const completed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('completed', 'done')").get();
    const failed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'failed'").get();
    const executions = db.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful FROM executions").get();

    return {
      totalTasks: tasks.total,
      runningTasks: running.count,
      completedTasks: completed.count,
      failedTasks: failed.count,
      totalExecutions: executions.total,
      successfulExecutions: executions.successful
    };
  },

  // Cleanup old logs (for production)
  cleanupOldLogs: (daysOld = 30) => {
    const before = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const logs = db.prepare('DELETE FROM run_logs WHERE created_at < ?').run(before);
    const sysLogs = db.prepare('DELETE FROM system_logs WHERE created_at < ?').run(before);
    return { logsDeleted: logs.changes, sysLogsDeleted: sysLogs.changes };
  }
};

// Expose both db and helpers
module.exports = { db, ...dbHelpers };
