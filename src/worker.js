/**
 * Worker — drives Claude.ai in a REAL visible browser using Playwright.
 *
 * For each prompt it:  opens a fresh chat → types the prompt → submits →
 * waits for Claude to finish → reads the answer → sends it via Email/WhatsApp.
 *
 * No API key needed. You log into claude.ai once in the browser window that
 * opens; the login is saved (persistent profile) so future runs skip it.
 *
 * Note: this drives the claude.ai web page, so if Anthropic changes the page
 * layout, the selectors below may need a small update.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const delivery = require('./delivery');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function log(type, msg, extra = {}) {
  process.stdout.write('LOG::' + JSON.stringify({ type, msg, ...extra }) + '\n');
}
function firstLine(s) { return (s || '').split('\n')[0].trim(); }

const NEW_CHAT_URL = 'https://claude.ai/new';

async function findEditor(page, timeout) {
  try {
    return await page.waitForSelector('div[contenteditable="true"]', { timeout });
  } catch { return null; }
}

async function typePrompt(page, prompt) {
  const editor = await findEditor(page, 30000);
  if (!editor) throw new Error('Could not find Claude input box');
  await editor.click();
  await sleep(200);

  // Type line by line. Shift+Enter = newline, Enter = submit.
  const lines = prompt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 6 });
    if (i < lines.length - 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await sleep(150);
  await page.keyboard.press('Enter');
}

async function getLastAnswer(page) {
  return await page.evaluate(() => {
    const pick = (sel) => {
      const els = document.querySelectorAll(sel);
      return els.length ? (els[els.length - 1].innerText || '') : null;
    };
    // Claude's answer bubble (current + a couple of fallbacks)
    return pick('.font-claude-message')
        || pick('[data-testid="message-content"]')
        || pick('.prose')
        || '';
  });
}

async function isGenerating(page) {
  return await page.evaluate(() =>
    !!document.querySelector('[data-is-streaming="true"], button[aria-label="Stop response"], button[aria-label*="Stop"]')
  );
}

// Wait until the answer stops changing AND generation has stopped.
async function waitForAnswer(page) {
  const MAX = 240000;        // 4 min hard cap
  const start = Date.now();
  let last = '';
  let stable = 0;
  await sleep(1500);         // let the answer begin
  while (Date.now() - start < MAX) {
    const cur = await getLastAnswer(page);
    const gen = await isGenerating(page);
    if (cur && cur === last) stable++; else { stable = 0; last = cur; }
    if (gen) stable = 0;                       // still streaming → reset
    if (!gen && cur && stable >= 3) break;     // ~2.4s stable & not generating
    await sleep(800);
  }
  return last.trim();
}

(async () => {
  const tmp = process.argv[2];
  const { mode, tasks, config, userDataDir } = JSON.parse(fs.readFileSync(tmp, 'utf8'));

  log('info', 'Opening browser…');
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      args: ['--start-maximized']
    });
  } catch (e) {
    log('error', 'Could not launch browser. Run "npx playwright install chromium". ' + e.message);
    process.exit(1);
  }

  const page = context.pages()[0] || await context.newPage();
  await page.goto(NEW_CHAT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // ── Login check ──
  let editor = await findEditor(page, 8000);
  if (!editor) {
    log('login', '🔑 Please log in to Claude in the browser window. Waiting for you…');
    editor = await findEditor(page, 300000); // up to 5 min to log in
    if (!editor) { log('error', 'Login timed out.'); await context.close(); process.exit(1); }
  }
  log('info', '✅ Claude is ready.');

  if (mode === 'login-only') {
    log('done', '✅ Logged in & saved. Leave this browser, then click "Run tasks". You won\'t need to log in again.');
    return; // keep browser open so the session is saved
  }

  // ── Run each task ──
  for (let i = 0; i < tasks.length; i++) {
    const prompt = tasks[i];
    const title = firstLine(prompt).slice(0, 70);
    log('task-start', `▶ Task ${i + 1}/${tasks.length}: ${title}`, { index: i });

    try {
      await page.goto(NEW_CHAT_URL, { waitUntil: 'domcontentloaded' });
      await findEditor(page, 30000);
      await typePrompt(page, prompt);
      log('info', '⌛ Claude is thinking…', { index: i });

      const answer = await waitForAnswer(page);
      if (!answer) throw new Error('Empty answer (page may have changed)');
      log('task-answer', `💬 Got answer (${answer.length} chars)`, { index: i, answer });

      const res = await delivery.deliver(prompt, answer, config, i + 1, tasks.length);
      log('task-done', `📨 Sent via ${res.summary}`, { index: i });

    } catch (e) {
      log('task-error', `❌ Task ${i + 1} failed: ${e.message}`, { index: i });
    }
    await sleep(1500);
  }

  log('done', '🎉 All tasks complete!');
  // Browser stays open so you can review the chats.
})().catch(e => { log('error', e.message); process.exit(1); });
