# 🚀 TaskPilot

Give Claude a list of prompts. TaskPilot opens **claude.ai in a real browser**,
types each prompt, waits for the answer, and sends it to your **Email** or **WhatsApp**.

You watch it happen live. **No API key needed** — you just log into Claude once.

---

## What it does

```
You type tasks (one per line)
        ↓
Claude.ai opens in a real browser window
        ↓
For each task:  type prompt → submit → wait for answer → read it
        ↓
Answer sent to your Email and/or WhatsApp
```

Perfect for: you set up a few prompts in the morning at the office, hit Run,
and the answers arrive in your inbox / WhatsApp.

---

## Setup (one time)

```bash
git clone https://github.com/beingsahilsharma13/taskpilot.git
cd taskpilot
npm install          # also downloads the browser Playwright needs
npm start
```

The first `npm install` runs `playwright install chromium` automatically.

---

## How to use

1. **Click "⚙ Configure"** and turn on **Email** and/or **WhatsApp**:
   - **Email** → your Gmail + a Gmail **App Password** (not your normal password) + where to send answers.
   - **WhatsApp** → Twilio SID, token, the Twilio WhatsApp number, and your number.
   - Click **Save configuration**.

2. **First time only — click "🔑 Open Claude & log in".**
   A browser opens. Log into claude.ai normally. Your login is saved, so you
   only do this once.

3. **Type your tasks**, one per line:
   ```
   Summarize the top 5 Java news this week
   Write a standup update about finishing the login API
   Give me 3 interview questions on Java concurrency with answers
   ```

4. **Click "▶ Run tasks".** Watch the browser do each one. Answers are sent
   to your Email / WhatsApp as they finish.

> For a long multi-line prompt, separate tasks with a line containing only `---`.

---

## Getting a Gmail App Password
1. Go to **myaccount.google.com/security** → turn on **2-Step Verification**.
2. Go to **myaccount.google.com/apppasswords** → create one → copy the 16 characters.
3. Paste it into TaskPilot's Gmail App Password field.

## Getting Twilio WhatsApp (optional)
1. Free trial at **twilio.com**.
2. Messaging → **Try WhatsApp** → join the sandbox from your phone.
3. Copy the **Account SID**, **Auth Token**, and the sandbox **from** number.

---

## Notes
- This drives the real claude.ai web page. If Anthropic changes the page layout,
  the part that types/reads may need a small selector update in `src/worker.js`.
- Everything is local. Your config is saved on your machine only and is **not**
  pushed to GitHub.

Built by Sahil Sharma.
