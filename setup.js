/**
 * TaskPilot Setup Script
 * Run: node setup.js
 * 
 * Reads .env file and saves all settings into the SQLite database
 * so the app loads with everything configured on first launch.
 */

require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const os = require('os');

// Match the same path logic as the Electron app uses
// On Mac: ~/Library/Application Support/taskpilot/taskpilot.db
const userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'taskpilot');
const localPath = path.join(__dirname, 'database', 'taskpilot.db');

const fs = require('fs');

// Try app data path first, fall back to local
let dbPath;
if (fs.existsSync(userDataPath)) {
  dbPath = path.join(userDataPath, 'taskpilot.db');
} else {
  fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
  dbPath = localPath;
}

console.log(`📦 Database path: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create settings table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const setSetting = db.prepare(
  'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
);

const settings = {
  claudeApiKey:  process.env.CLAUDE_API_KEY,
  openaiApiKey:  process.env.OPENAI_API_KEY,
  twilioSid:     process.env.TWILIO_ACCOUNT_SID,
  twilioToken:   process.env.TWILIO_AUTH_TOKEN,
  twilioFrom:    process.env.TWILIO_WHATSAPP_FROM,
  whatsappTo:    process.env.YOUR_WHATSAPP_NUMBER,
  gmailUser:     process.env.GMAIL_USER,
  gmailPass:     process.env.GMAIL_APP_PASSWORD,
  emailTo:       process.env.NOTIFY_EMAIL,
  ngrokUrl:      process.env.NGROK_URL,
};

let saved = 0;
for (const [key, value] of Object.entries(settings)) {
  if (value && value.trim()) {
    setSetting.run(key, value.trim());
    const masked = value.length > 8 ? value.substring(0, 6) + '****' : '****';
    console.log(`  ✅ ${key} = ${masked}`);
    saved++;
  }
}

console.log(`\n✅ Setup complete — ${saved} setting(s) saved!`);
console.log(`🚀 Now run: npm start\n`);
db.close();
