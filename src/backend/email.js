const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = null;
    this.toEmail = null;
    this.fromEmail = null;
  }

  init(smtpUser, smtpPass, toEmail) {
    this.fromEmail = smtpUser;
    this.toEmail = toEmail;
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass }
    });
  }

  isReady() { return !!(this.transporter && this.toEmail); }

  async sendTaskResult(taskTitle, aiResponse, position, total, confirmUrl) {
    if (!this.isReady()) throw new Error("Email not configured");

    const html = this.buildHtml(taskTitle, aiResponse, position, total, confirmUrl);

    await this.transporter.sendMail({
      from: `"TaskPilot" <${this.fromEmail}>`,
      to: this.toEmail,
      subject: `✅ TaskPilot — Task ${position}/${total}: ${taskTitle}`,
      html
    });
  }

  buildHtml(title, response, position, total, confirmUrl) {
    return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
      <h2 style="color:#0ea5e9">✅ Task ${position}/${total} Complete</h2>
      <p><strong>Task:</strong> ${title}</p>
      <hr/>
      <h3>AI Response:</h3>
      <div style="background:#f1f5f9;padding:16px;border-radius:8px;white-space:pre-wrap">${response}</div>
      <hr/>
      <p><strong>What would you like to do?</strong></p>
      <a href="${confirmUrl}?action=confirm" style="background:#22c55e;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-right:8px">▶ CONFIRM</a>
      <a href="${confirmUrl}?action=skip"    style="background:#f59e0b;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-right:8px">⏭ SKIP</a>
    </div>`;
  }
}

module.exports = new EmailService();
