/**
 * Desktop Automation Service
 * Handles launching Claude and capturing responses
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class DesktopAutomationService {
  constructor() {
    this.platform = process.platform;
    this.claudeDesktopPath = this.findClaudeDesktop();
  }

  findClaudeDesktop() {
    if (this.platform === 'darwin') {
      const appPath = '/Applications/Claude.app';
      return fs.existsSync(appPath) ? appPath : null;
    } else if (this.platform === 'win32') {
      const winPath = path.join(process.env.APPDATA, 'Claude');
      return fs.existsSync(winPath) ? winPath : null;
    }
    return null;
  }

  launchClaudeDesktopMac() {
    if (this.platform !== 'darwin') throw new Error('macOS only');
    const script = `tell application "Finder" to open POSIX file "/Applications/Claude.app"`;
    try {
      execSync(`osascript -e '${script}'`);
      console.log('[Desktop] Claude Desktop launched');
      return true;
    } catch (e) {
      console.warn('[Desktop] Failed to launch Claude Desktop');
      return false;
    }
  }

  openClaudeWeb() {
    const url = 'https://claude.ai';
    try {
      if (this.platform === 'darwin') execSync(`open '${url}'`);
      else if (this.platform === 'win32') execSync(`start ${url}`);
      else execSync(`xdg-open ${url}`);
      console.log('[Desktop] Claude Web opened');
    } catch (e) {
      console.warn('[Desktop] Could not open browser');
    }
  }

  focusWindow(appName) {
    if (this.platform !== 'darwin') return;
    const script = `tell application "${appName}" to activate`;
    try { execSync(`osascript -e '${script}'`); } catch (e) {}
  }

  getSystemInfo() {
    return {
      platform: this.platform,
      arch: os.arch(),
      claudeDesktopFound: !!this.claudeDesktopPath,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new DesktopAutomationService();
