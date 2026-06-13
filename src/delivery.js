/**
 * Delivery — send a task's answer over Email (Gmail) and/or WhatsApp (Twilio).
 * Everything is optional and driven by the saved config.
 */
const nodemailer = require('nodemailer');

function firstLine(s) { return (s || '').split('\n')[0].trim(); }
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emailHtml(title, prompt, response, idx, total) {
  return `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:680px;margin:auto;color:#1a1a1a">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:24px;border-radius:12px 12px 0 0">
      <h2 style="margin:0">✅ Task ${idx}/${total} done</h2>
      <div style="opacity:.9;margin-top:4px;font-size:14px">${esc(title)}</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Your prompt</div>
      <pre style="background:#f6f6f8;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${esc(prompt)}</pre>
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px">Claude's answer</div>
      <div style="background:#f0f7ff;padding:14px;border-radius:8px;white-space:pre-wrap;line-height:1.65;font-size:14px">${esc(response)}</div>
      <div style="margin-top:18px;color:#aaa;font-size:12px">Sent by TaskPilot · ${new Date().toLocaleString()}</div>
    </div>
  </div>`;
}

async function sendEmail(subject, html, cfg) {
  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.gmailUser, pass: cfg.gmailPass }
  });
  await t.sendMail({ from: `"TaskPilot" <${cfg.gmailUser}>`, to: cfg.emailTo, subject, html });
}

async function sendWhatsApp(body, cfg) {
  const client = require('twilio')(cfg.twilioSid, cfg.twilioToken);
  const from = cfg.twilioFrom.startsWith('whatsapp:') ? cfg.twilioFrom : `whatsapp:${cfg.twilioFrom}`;
  const to = cfg.whatsappTo.startsWith('whatsapp:') ? cfg.whatsappTo : `whatsapp:${cfg.whatsappTo}`;
  await client.messages.create({ from, to, body });
}

async function deliver(prompt, response, cfg, idx, total) {
  const title = firstLine(prompt).slice(0, 70);
  const sent = [];

  if (cfg.emailEnabled && cfg.gmailUser && cfg.gmailPass && cfg.emailTo) {
    await sendEmail(`TaskPilot ${idx}/${total}: ${title}`, emailHtml(title, prompt, response, idx, total), cfg);
    sent.push('email');
  }

  if (cfg.whatsappEnabled && cfg.twilioSid && cfg.twilioToken && cfg.twilioFrom && cfg.whatsappTo) {
    const preview = response.length > 1400 ? response.slice(0, 1400) + '\n\n…(full answer in email)' : response;
    await sendWhatsApp(`✅ *TaskPilot ${idx}/${total}*\n*${title}*\n\n${preview}`, cfg);
    sent.push('whatsapp');
  }

  return { summary: sent.length ? sent.join(' + ') : 'no channel configured', sent };
}

module.exports = { deliver, firstLine };
