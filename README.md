# 🚀 TaskPilot — AI Todo Automation

Give TaskPilot your todo list. It runs each task on Claude or ChatGPT, sends the result to your **WhatsApp**, and waits for your confirmation before moving to the next task.

## ✨ How It Works

```
1. You add tasks (prompts) to the queue
2. TaskPilot runs each one on Claude or ChatGPT
3. Result is sent to your WhatsApp via Twilio
4. You reply: CONFIRM / MODIFY / SKIP
5. TaskPilot runs the next task
6. If rate limit hit → waits automatically → resumes
```

## 📱 WhatsApp Confirmation Flow

When a task completes, you get a WhatsApp message like:

```
✅ TaskPilot — Task 1/3 Complete
Task: Summarize today's AI news

AI Response:
[full response here]

━━━━━━━━━━━━━━━━━━
Reply with:
▶ CONFIRM — run next task
✏️ MODIFY <instruction> — modify & re-run  
⏭ SKIP — skip next task
⏸ PAUSE — pause the queue
```

You reply → TaskPilot continues automatically.

## 🛠️ Setup

### Step 1 — Clone & install
```bash
git clone https://github.com/beingsahilsharma13/taskpilot.git
cd taskpilot
npm install
```

### Step 2 — Start the app
```bash
npm start
```

### Step 3 — Configure API keys in Settings
- **Claude API Key** → get from console.anthropic.com
- **OpenAI API Key** → get from platform.openai.com
- **Twilio** → for WhatsApp (see below)

### Step 4 — Set up WhatsApp (Twilio)
1. Create account at [twilio.com](https://twilio.com)
2. Go to Messaging → Try it out → Send a WhatsApp message
3. Join the sandbox (send "join ..." to the Twilio number)
4. Install ngrok: `npm install -g ngrok`
5. Run: `ngrok http 3456`
6. Copy the ngrok URL (e.g. `https://abc123.ngrok.io`)
7. In Twilio Console → WhatsApp Sandbox → "When a message comes in":
   Set to: `https://abc123.ngrok.io/webhook/whatsapp`
8. Add your Twilio credentials in TaskPilot Settings

## 📦 Build for distribution

```bash
# Mac
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build:all
```

Output files are in the `dist/` folder.

## 🗂️ Project Structure

```
taskpilot/
├── main.js                    ← Electron main process
├── preload.js                 ← Secure IPC bridge
├── database/
│   └── db.js                  ← SQLite (tasks, settings, logs)
├── src/
│   ├── backend/
│   │   ├── aiEngine.js        ← Claude + OpenAI API calls
│   │   ├── taskQueue.js       ← Queue runner + confirmation logic
│   │   ├── whatsapp.js        ← Twilio WhatsApp integration
│   │   ├── email.js           ← Email fallback (Nodemailer)
│   │   └── rateLimiter.js     ← Auto-pause + retry on 429
│   ├── ui/
│   │   └── index.html         ← App UI (Todo Queue + Chat + Settings)
│   └── webhook/
│       └── server.js          ← Express server (receives WhatsApp replies)
└── package.json
```

## 💡 Features

| Feature | Description |
|---|---|
| Todo Queue | Add tasks with prompts, AI choice, and notification channel |
| Linked Tasks | Pass previous task's response as context to next task |
| WhatsApp Confirmations | Confirm, modify, or skip via WhatsApp reply |
| Direct Chat | Chat with Claude or ChatGPT directly inside the app |
| Rate Limit Handling | Auto-detects 429 errors, waits, and retries |
| Cross-platform | Mac, Windows, Linux (Android via Capacitor) |

## Built with ❤️ by Sahil Sharma
