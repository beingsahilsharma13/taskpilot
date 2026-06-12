/**
 * Browser Automation Service
 * Opens Claude.ai / ChatGPT.com in the user's REAL browser so they can
 * WATCH the AI work, then paste the response back into TaskPilot.
 * Uses Electron's built-in shell + clipboard — works on Mac/Win/Linux.
 */
const { shell, clipboard } = require('electron');

class BrowserAutomationService {
  open(provider, prompt) {
    const url = (provider || 'claude') === 'openai'
      ? 'https://chatgpt.com'
      : 'https://claude.ai/new';

    clipboard.writeText(prompt);   // prompt is ready to paste (Cmd+V / Ctrl+V)
    shell.openExternal(url);       // opens the user's default browser

    console.log(`[BrowserAuto] Opened ${url} — prompt copied to clipboard`);
    return { success: true, url, provider: provider || 'claude' };
  }
}

module.exports = new BrowserAutomationService();
