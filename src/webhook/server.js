/**
 * Webhook server — runs on port 3456 inside the Electron app.
 * 
 * Twilio sends POST to /webhook/whatsapp when user replies.
 * Use ngrok to expose this to the internet:
 *   npx ngrok http 3456
 * Then set Twilio → WhatsApp Sandbox → "When a message comes in":
 *   https://YOUR-NGROK-URL.ngrok-free.app/webhook/whatsapp
 */

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let server = null;
const PORT = 3456;

// Lazy-load queue to avoid circular deps
function queue() { return require("../backend/taskQueue"); }

// ── WhatsApp reply from Twilio ────────────────────────────────
app.post("/webhook/whatsapp", (req, res) => {
  const body = req.body.Body || "";
  const from = req.body.From || "";
  console.log(`[Webhook] WhatsApp from ${from}: "${body}"`);
  queue().handleReply(body);
  // Twilio requires empty TwiML response
  res.type("text/xml").send("<Response></Response>");
});

// ── In-app confirm button (fallback when no WhatsApp) ─────────
app.get("/confirm", (req, res) => {
  const action = req.query.action || "confirm";
  const instruction = req.query.instruction || "";
  const msg = action === "modify" ? `MODIFY ${instruction}` : action.toUpperCase();
  queue().handleReply(msg);
  res.send(`
    <html>
      <head><title>TaskPilot</title><meta charset="utf-8"/></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f14;color:#e2e8f0">
        <h2 style="color:#6ee7b7">✅ TaskPilot</h2>
        <p>Action <strong>${action}</strong> received!</p>
        <p style="color:#64748b">You can close this tab.</p>
      </body>
    </html>`);
});

// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT, time: new Date().toISOString() });
});

function startServer() {
  return new Promise((resolve, reject) => {
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Webhook] Listening on http://localhost:${PORT}`);
      resolve(PORT);
    }).on("error", reject);
  });
}

function stopServer() {
  if (server) { server.close(); server = null; }
}

module.exports = { startServer, stopServer, PORT };
