# 🚀 TaskPilot — Daily AI Task Automation

> Give your daily todo list to Claude or ChatGPT. They run it, send you the results on WhatsApp, and wait for your confirmation before running the next task.

---

## 🎯 How it works

```
You add tasks (prompts) → TaskPilot runs them on Claude/ChatGPT
→ Result sent to YOUR WhatsApp → You reply CONFIRM/MODIFY/SKIP
→ Next task runs automatically
```

## 📱 WhatsApp Flow

When a task completes, you get this on WhatsApp:

```
🤖 TaskPilot — Today's Tasks
📋 Task 2/5: Summarize Java news

AI Response:
[Full AI response here]

━━━━━━━━━━━━━━
✅ Reply CONFIRM → run next task
✏️ Reply MODIFY your change → re-run with change
⏭ Reply SKIP → skip to next task
⏸ Reply PAUSE → pause queue
```

You reply → next task auto-runs!

---

## ⚡ Quick Setup

### Step 1 — Install
```bash
git clone https://github.com/beingsahilsharma13/taskpilot.git
cd taskpilot
npm install
```

### Step 2 — Start ngrok (for WhatsApp webhook)
```bash
# In a separate terminal
npx ngrok http 3456
# Copy the https URL (e.g. https://abc123.ngrok-free.app)
```

### Step 3 — Run the app
```bash
npm start
```

### Step 4 — Add settings in app
Open Settings tab and add:
- **Claude API key** → get from console.anthropic.com
- **OpenAI API key** → get from platform.openai.com
- **Twilio credentials** → get from twilio.com (free sandbox)
- Your **WhatsApp number**
- The **ngrok URL** from Step 2

### Step 5 — Set Twilio webhook
Go to Twilio Console → Messaging → WhatsApp Sandbox → set:
```
When a message comes in: https://YOUR-NGROK-URL.ngrok-free.app/webhook/whatsapp
```

### Step 6 — Add tasks and run!
1. Type task name + prompt in the app
2. Select Claude or ChatGPT per task
3. Click **Run All Tasks**
4. Watch results arrive on WhatsApp!

---

## 🖥️ Platforms
| Platform | Command |
|---|---|
| Mac | `npm run build:mac` |
| Windows | `npm run build:win` |
| Linux | `npm run build:linux` |
| All | `npm run build:all` |

---

## 🔑 Features
- ✅ Claude + ChatGPT support — choose per task
- ✅ WhatsApp confirmations via Twilio
- ✅ CONFIRM / MODIFY / SKIP / PAUSE from WhatsApp
- ✅ Linked tasks — pass previous response as context
- ✅ Auto rate-limit handling — waits and retries
- ✅ Built-in chat with Claude or ChatGPT
- ✅ Daily progress tracking
- ✅ Email fallback (Gmail)
- ✅ SQLite local storage — no cloud needed

---

## 💬 WhatsApp Reply Commands
| Command | Action |
|---|---|
| `CONFIRM` | Run next task |
| `MODIFY write better code for Java 17` | Re-run with this instruction |
| `SKIP` | Skip to next task |
| `PAUSE` | Pause queue |
| `STOP` | Stop queue |

---

## 🛠️ Tech Stack
- **Electron** — cross-platform desktop (Mac/Win/Linux)
- **Node.js** — backend logic
- **SQLite** — local task storage
- **Anthropic SDK** — Claude API
- **OpenAI SDK** — ChatGPT API
- **Twilio** — WhatsApp messaging
- **Express** — webhook server
- **Nodemailer** — email fallback

## Built with ❤️ by Sahil Sharma

---

## 🌐 NEW: Browser Mode (v3)

Each task can now run in one of two modes:

| Mode | What happens |
|---|---|
| ⚡ **API** | Claude **Fable 5** / ChatGPT runs the task automatically in the background |
| 🌐 **Browser** | TaskPilot **opens claude.ai / chatgpt.com in your real browser**, copies the prompt to your clipboard — you paste it (Cmd+V), **watch the AI work live**, copy the response, and paste it back. TaskPilot then delivers it via WhatsApp/Email |

Browser Mode flow:
```
Run Task → claude.ai opens → Cmd+V (prompt auto-copied) → watch AI work
→ Cmd+C the response → paste into TaskPilot → delivered to WhatsApp/Email ✅
```

## 🤖 Claude Fable 5

TaskPilot now runs on **Claude Fable 5** (`claude-fable-5`) — Anthropic's newest
and most intelligent model. If your API key doesn't have Fable 5 access yet,
the app automatically falls back to Claude Sonnet 4.6, so nothing breaks.
