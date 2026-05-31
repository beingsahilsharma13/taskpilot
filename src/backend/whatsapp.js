const twilio = require("twilio");

class WhatsAppService {
  constructor() {
    this.client = null;
    this.fromNumber = null; // e.g. "whatsapp:+14155238886" (Twilio sandbox)
    this.toNumber = null;   // e.g. "whatsapp:+919876543210"
  }

  init(accountSid, authToken, fromNumber, toNumber) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber.startsWith("whatsapp:")
      ? fromNumber : `whatsapp:${fromNumber}`;
    this.toNumber = toNumber.startsWith("whatsapp:")
      ? toNumber : `whatsapp:${toNumber}`;
  }

  isReady() {
    return !!(this.client && this.fromNumber && this.toNumber);
  }

  // Send AI response + confirmation prompt to WhatsApp
  async sendTaskResult(taskTitle, aiResponse, taskPosition, totalTasks) {
    if (!this.isReady()) throw new Error("WhatsApp not configured");

    const message = this.formatMessage(taskTitle, aiResponse, taskPosition, totalTasks);

    const result = await this.client.messages.create({
      body: message,
      from: this.fromNumber,
      to: this.toNumber
    });

    console.log(`[WhatsApp] Message sent: ${result.sid}`);
    return result.sid;
  }

  // Send a simple notification
  async sendNotification(text) {
    if (!this.isReady()) throw new Error("WhatsApp not configured");
    return this.client.messages.create({
      body: text, from: this.fromNumber, to: this.toNumber
    });
  }

  formatMessage(taskTitle, aiResponse, position, total) {
    const preview = aiResponse.length > 800
      ? aiResponse.substring(0, 800) + "...\n\n_(Response truncated. Full response in app.)_"
      : aiResponse;

    return [
      `✅ *TaskPilot — Task ${position}/${total} Complete*`,
      `*Task:* ${taskTitle}`,
      ``,
      `*AI Response:*`,
      preview,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `Reply with:`,
      `▶ *CONFIRM* — run next task`,
      `✏️ *MODIFY <your instruction>* — modify & re-run`,
      `⏭ *SKIP* — skip next task`,
      `⏸ *PAUSE* — pause the queue`,
    ].join("\n");
  }

  // Parse incoming WhatsApp message from user
  parseConfirmation(messageBody) {
    const text = messageBody.trim().toUpperCase();

    if (text === "CONFIRM") return { action: "confirm" };
    if (text === "SKIP") return { action: "skip" };
    if (text === "PAUSE") return { action: "pause" };
    if (text.startsWith("MODIFY ")) {
      return { action: "modify", instruction: messageBody.trim().substring(7) };
    }

    return { action: "unknown", raw: messageBody };
  }
}

module.exports = new WhatsAppService();
