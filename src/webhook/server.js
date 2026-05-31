/**
 * Webhook Server
 * 
 * This is a small Express server that runs inside the Electron app.
 * Twilio sends WhatsApp replies to this server.
 * 
 * For local dev: use ngrok to expose this server publicly.
 * Example: ngrok http 3456
 * Then set your Twilio webhook URL to: https://xxxxx.ngrok.io/webhook/whatsapp
 */

const express = require('express');
const taskQueue = require('../backend/taskQueue');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let server = null;
const PORT = 3456;

// ── WhatsApp webhook (Twilio sends POST here) ────────────────
app.post('/webhook/whatsapp', (req, res) => {
  const messageBody = req.body.Body || '';
  const from = req.body.From || '';

  console.log(`[Webhook] Incoming WhatsApp from ${from}: "${messageBody}"`);

  // Pass to task queue to handle
  taskQueue.handleIncomingMessage(messageBody);

  // Twilio needs an empty TwiML response
  res.type('text/xml').send('<Response></Response>');
});

// ── Email confirmation link ──────────────────────────────────
app.get('/confirm', (req, res) => {
  const action = req.query.action || 'confirm';
  taskQueue.handleIncomingMessage(action.toUpperCase());
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ TaskPilot</h2>
      <p>Action <strong>${action}</strong> received!</p>
      <p>You can close this tab.</p>
    </body></html>
  `);
});

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, timestamp: new Date().toISOString() });
});

// ── Start / Stop ─────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      console.log(`[Webhook] Server listening on port ${PORT}`);
      resolve(PORT);
    });
    server.on('error', reject);
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startServer, stopServer, PORT };
