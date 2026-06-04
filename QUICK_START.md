# TaskPilot v2 — Quick Start Guide

## 🚀 30-Second Setup

```bash
# 1. Clone
git clone https://github.com/beingsahilsharma13/taskpilot.git && cd taskpilot

# 2. Install
npm install

# 3. Create .env with your keys
cat > .env << 'EOF'
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
EOF

# 4. Run
npm start
```

---

## ⚙️ Configuration (2 minutes)

When app starts, go to **Settings** tab:

1. **Claude API Key** — Get from [console.anthropic.com](https://console.anthropic.com)
2. **Gmail App Password** — Get from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Must have 2FA enabled
   - Not your regular Gmail password!
3. **Optional: WhatsApp** — Get from [twilio.com](https://twilio.com) (free trial)

Click **Save Settings** ✅

---

## 📝 Create Your First Task (1 minute)

1. **Task name:** `Summarize Java news`
2. **Prompt:** `Find and summarize the top 5 Java/Spring news items from today`
3. **AI:** Claude ✓
4. **Deliver via:** Email + WhatsApp (choose as many as you want!)
5. Click **Add Task** ✅

---

## ▶️ Run It!

Click **▶ Run All Tasks**

Watch what happens:

1. 🤖 Claude processes your prompt
2. 📨 Email sent to your inbox
3. 📱 WhatsApp message sent (if configured)
4. ✅ Task marked as completed
5. 📊 Dashboard updates with stats

---

## 📊 Dashboard

Click **Activity** tab to see:

- **Total Tasks:** How many you created
- **Completed:** Successfully ran
- **Failed:** Had errors
- **Running:** Currently executing
- **Success Rate:** Percentage of successful runs
- **Execution History:** Every task run with AI response, delivery status, duration

---

## 🔄 Retry Failed Tasks

If a task fails:

1. Click the failed task in the list
2. Click **Retry** button
3. It runs again from scratch

---

## 💡 Pro Tips

### Tip 1: Task Chaining
- Create Task 1: "Summarize Java news"
- Create Task 2: "Write a tweet about Java news"
- Enable "Pass previous task's response as context" on Task 2
- Now Task 2 automatically gets Task 1's response as input! 🔗

### Tip 2: Multiple Deliveries
- Set "Deliver via: Email + WhatsApp" to send results to BOTH
- Fall back to email if WhatsApp fails
- Perfect for important tasks!

### Tip 3: Check Execution History
- Go to **Activity** tab
- Scroll down to see every task you've run
- Click on any row to see full AI response

### Tip 4: Monitor Rate Limits
- If Claude hits rate limit, app auto-waits and retries
- You'll see "⏳ Rate limited — waiting 60s" in UI
- No action needed, it's automatic! ⏱️

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Claude API key not configured" | Go to Settings, paste key from console.anthropic.com |
| Email not arriving | Check junk folder, verify Gmail app password (not regular password) |
| WhatsApp not working | Get Twilio account, run ngrok, set webhook URL in Twilio console |
| Rate limit keeps hitting | Normal! App auto-retries. Just be patient or upgrade API plan |
| Task takes too long | Check network, increase API timeout in Settings |

---

## 📚 Full Documentation

- **Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Implementation:** See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
- **GitHub:** [github.com/beingsahilsharma13/taskpilot](https://github.com/beingsahilsharma13/taskpilot)

---

## 🛠️ Advanced: WhatsApp Setup

Only if you want WhatsApp confirmations (optional!):

```bash
# 1. Get Twilio free trial account
# 2. Copy these from Twilio console:
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
export TWILIO_AUTH_TOKEN=your_token

# 3. In another terminal, run ngrok:
npx ngrok http 3456
# You'll see: https://xxxxx.ngrok-free.app

# 4. In Twilio console, set webhook:
# Go to Messaging → WhatsApp Sandbox
# "When a message comes in": https://xxxxx.ngrok-free.app/webhook/whatsapp

# 5. Paste these in TaskPilot Settings:
# - Twilio Account SID
# - Twilio Auth Token
# - From (Twilio number from sandbox)
# - Your WhatsApp number
```

That's it! Now tasks will be sent to WhatsApp. 📱

---

## 🎯 What Can You Automate?

Examples:

```
✅ Summarize news → Get daily digest by email
✅ Draft content → AI writes, you review, approve
✅ Code review → Get AI feedback on pull requests
✅ Research topics → Aggregate & summarize research
✅ Write emails → Draft professional emails
✅ Translate text → Auto-translate documents
✅ Generate ideas → Brainstorm with AI
✅ Plan projects → Break down tasks automatically
```

---

## 💪 Confidence Tips for Learning

**You've got this!** Here's why:

1. **Start small** — One task first, then build up
2. **Read errors** — App tells you exactly what's wrong
3. **Settings are safe** — You can change them anytime
4. **Auto-retry** — If something fails, app tries again
5. **Dashboard shows everything** — See all task runs, no mystery

---

## 🚀 Next Steps

1. ✅ Setup complete? Run your first task!
2. 📈 After 5 tasks? Check your success rate in dashboard
3. 🔗 Create task chains to automate multi-step workflows
4. 📊 Export execution history as CSV (coming soon!)
5. 🤖 Explore both Claude and ChatGPT on same tasks

---

**Questions?** Check [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) or open an issue on GitHub! 💙

