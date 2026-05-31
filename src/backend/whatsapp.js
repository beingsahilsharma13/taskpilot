const twilio = require("twilio");

class WhatsAppService {
  constructor() {
    this.client = null;
    this.fromNumber = null;
    this.toNumber = null;
  }

  init(accountSid, authToken, fromNumber, toNumber) {
    if (!accountSid || !authToken) return;
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    this.toNumber   = toNumber.startsWith("whatsapp:")   ? toNumber   : `whatsapp:${toNumber}`;
  }

  isReady() {
    return !!(this.client && this.fromNumber && this.toNumber);
  }

  // Send task result + confirmation options to WhatsApp
  async sendTaskResult({ taskTitle, aiResponse, position, total, listName }) {
    if (!this.isReady()) throw new Error("WhatsApp not configured");

    // Truncate long responses so WhatsApp doesn't cut it
    const preview = aiResponse.length > 900
      ? aiResponse.substring(0, 900) + "\n\n_(Truncated — full response in app)_"
      : aiResponse;

    const body = [
      `🤖 *TaskPilot — ${listName}*`,
      `📋 Task ${position}/${total}: *${taskTitle}*`,
      ``,
      `*AI Response:*`,
      preview,
      ``,
      `━━━━━━━━━━━━━━`,
      `✅ Reply *CONFIRM* → run next task`,
      `✏️ Reply *MODIFY your change* → re-run with change`,
      `⏭ Reply *SKIP* → skip to next task`,
      `⏸ Reply *PAUSE* → pause queue`,
    ].join("\n");

    const result = await this.client.messages.create({
      body,
      from: this.fromNumber,
      to: this.toNumber,
    });

    console.log(`[WhatsApp] Sent message SID: ${result.sid}`);
    return result.sid;
  }

  // Send a simple text message
  async sendText(text) {
    if (!this.isReady()) { console.warn("[WhatsApp] Not configured, skipping send"); return; }
    return this.client.messages.create({ body: text, from: this.fromNumber, to: this.toNumber });
  }

  async sendAllDone(listName) {
    return this.sendText(`🎉 *TaskPilot* — All tasks in *${listName}* are complete!`);
  }

  async sendRateLimited(provider, seconds) {
    return this.sendText(`⏳ *TaskPilot* — ${provider} rate limit hit. Auto-resuming in ${seconds}s...`);
  }

  // Parse what user replied on WhatsApp
  static parseReply(body = "") {
    const t = body.trim();
    const upper = t.toUpperCase();
    if (upper === "CONFIRM")   return { action: "confirm" };
    if (upper === "SKIP")      return { action: "skip" };
    if (upper === "PAUSE")     return { action: "pause" };
    if (upper === "STOP")      return { action: "stop" };
    if (upper.startsWith("MODIFY ")) return { action: "modify", instruction: t.substring(7).trim() };
    return { action: "unknown", raw: t };
  }
}

module.exports = new WhatsAppService();
