/**
 * Task Queue Engine — runs the daily list one task at a time.
 *
 * Two execution modes per task:
 *   api     → calls Claude (Fable 5) / OpenAI API directly. Fast, automatic.
 *   browser → opens Claude.ai / ChatGPT.com in the real browser. The prompt
 *             is copied to the clipboard, the user pastes it, WATCHES the AI
 *             work, then pastes the response back into TaskPilot.
 *
 * After every task: result is delivered (WhatsApp / Email / both),
 * then the queue waits for CONFIRM / MODIFY / SKIP / PAUSE.
 */
const EventEmitter = require("events");

function db()       { return require("../../database/db"); }
function ai()       { return require("./aiEngine"); }
function whatsapp() { return require("./whatsapp"); }
function email()    { return require("./email"); }
function browser()  { return require("../services/browserAutomation"); }

class TaskQueueEngine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.paused  = false;
    this.listId  = null;
    this.resolver        = null; // waits for CONFIRM/SKIP/MODIFY/PAUSE
    this.resumeResolver  = null; // waits for resume after pause
    this.browserResolver = null; // waits for the pasted browser response
  }

  async start(listId) {
    if (this.running) throw new Error("Queue already running");
    const list = db().getList(listId);
    if (!list) throw new Error("List not found");

    this.running = true;
    this.paused  = false;
    this.listId  = listId;

    db().updateListStatus(listId, "running");
    this.emit("list:started", { listId, name: list.name });
    console.log(`[Queue] Starting: ${list.name}`);

    try {
      await this._runNext(listId, null);
    } catch (err) {
      console.error("[Queue] Fatal:", err.message);
      this.emit("queue:error", { message: err.message });
    } finally {
      this.running = false;
    }
  }

  async _runNext(listId, prevResponse) {
    if (!this.running) return;

    const task = db().getNextPendingTask(listId);
    if (!task) {
      db().updateListStatus(listId, "completed");
      const list = db().getList(listId);
      this.emit("list:completed", { listId });
      await whatsapp().sendAllDone(list.name).catch(() => {});
      return;
    }

    if (this.paused) {
      this.emit("queue:paused", { taskId: task.id });
      await this._waitForResume();
      if (!this.running) return;
    }

    const allTasks = db().getTasksForList(listId);
    const position = task.position;
    const total    = allTasks.length;
    const list     = db().getList(listId);
    const mode     = (task.exec_mode || "api").toLowerCase();

    db().updateTaskStatus(task.id, "running");
    this.emit("task:started", { taskId: task.id, title: task.title, position, total, mode });
    db().log(task.id, "STARTED", `provider=${task.ai_provider} mode=${mode}`);

    try {
      const context = task.use_prev_context ? prevResponse : null;
      let aiResponse;

      if (mode === "browser") {
        // ── BROWSER MODE: the user watches the AI work ────────
        const fullPrompt = context
          ? `Context from previous task:\n\n${context}\n\n---\n\nNew task:\n${task.prompt}`
          : task.prompt;

        const info = browser().open(task.ai_provider, fullPrompt);
        db().log(task.id, "BROWSER_OPENED", info.url);
        this.emit("task:browser_waiting", {
          taskId: task.id, title: task.title,
          provider: task.ai_provider, url: info.url, position, total,
        });

        aiResponse = await this._waitForBrowserResponse();
        if (!this.running) return;

        if (aiResponse === null) {
          // user closed the paste window → skip this task
          db().updateTaskStatus(task.id, "skipped");
          db().log(task.id, "SKIPPED", "browser task cancelled by user");
          this.emit("task:skipped", { taskId: task.id });
          await this._runNext(listId, prevResponse);
          return;
        }
      } else {
        // ── API MODE: fully automatic ─────────────────────────
        aiResponse = await ai().run(task, context);
      }

      db().updateTaskStatus(task.id, "waiting_confirm", aiResponse);
      db().log(task.id, "AI_DONE", aiResponse.substring(0, 200));
      this.emit("task:response", { taskId: task.id, response: aiResponse, position, total });

      await this._notify(task, aiResponse, position, total, list.name);

      this.emit("task:waiting", { taskId: task.id });
      const confirm = await this._waitForConfirm();

      if (confirm.action === "confirm") {
        db().updateTaskStatus(task.id, "done");
        db().log(task.id, "CONFIRMED");
        this.emit("task:done", { taskId: task.id });
        await this._runNext(listId, aiResponse); // pass response as context

      } else if (confirm.action === "modify") {
        db().updateTask(task.id, {
          status: "pending",
          prompt: `${task.prompt}\n\nUser instruction: ${confirm.instruction}`,
          user_modification: confirm.instruction,
        });
        db().log(task.id, "MODIFIED", confirm.instruction);
        this.emit("task:modified", { taskId: task.id, instruction: confirm.instruction });
        await this._runNext(listId, prevResponse); // re-run same task

      } else if (confirm.action === "skip") {
        db().updateTaskStatus(task.id, "skipped");
        db().log(task.id, "SKIPPED");
        this.emit("task:skipped", { taskId: task.id });
        await this._runNext(listId, prevResponse);

      } else if (confirm.action === "pause") {
        this.paused = true;
        db().updateTaskStatus(task.id, "pending"); // requeue it
        db().updateListStatus(listId, "paused");
        db().log(task.id, "PAUSED");
        this.emit("queue:paused", { taskId: task.id });

      } else if (confirm.action === "stop") {
        this.running = false;
        db().updateListStatus(listId, "idle");
        this.emit("queue:stopped");
      }

    } catch (err) {
      db().updateTaskStatus(task.id, "failed");
      db().log(task.id, "FAILED", err.message);
      this.emit("task:failed", { taskId: task.id, error: err.message });
      throw err;
    }
  }

  // Deliver the result via the channel(s) chosen on the task
  async _notify(task, response, position, total, listName) {
    const wa = whatsapp();
    const em = email();
    const channel = (task.notify_channel || "whatsapp").toLowerCase();
    const wantWa  = channel === "whatsapp" || channel === "both";
    const wantEm  = channel === "email"    || channel === "both";
    let sent = false;

    if (wantWa && wa.isReady()) {
      await wa.sendTaskResult({ taskTitle: task.title, aiResponse: response, position, total, listName });
      sent = true;
    }
    if (wantEm && em.isReady()) {
      await em.sendTaskResult(task.title, task.prompt, response, position, total);
      sent = true;
    }

    // Fallback: chosen channel not configured → use whatever IS configured
    if (!sent) {
      if (wa.isReady()) {
        await wa.sendTaskResult({ taskTitle: task.title, aiResponse: response, position, total, listName });
        sent = true;
      } else if (em.isReady()) {
        await em.sendTaskResult(task.title, task.prompt, response, position, total);
        sent = true;
      }
    }

    if (!sent) {
      console.warn("[Queue] No notification channel configured!");
      this.emit("queue:warn", { message: "No WhatsApp/Email configured — confirm in the app." });
    }
  }

  _waitForConfirm()         { return new Promise(r => { this.resolver = r; }); }
  _waitForResume()          { return new Promise(r => { this.resumeResolver = r; }); }
  _waitForBrowserResponse() { return new Promise(r => { this.browserResolver = r; }); }

  // Called from the UI when the user pastes the browser response (null = skip)
  handleBrowserResponse(responseText) {
    console.log(`[Queue] Browser response: ${responseText ? responseText.length + " chars" : "cancelled"}`);
    if (this.browserResolver) {
      this.browserResolver(responseText);
      this.browserResolver = null;
    }
  }

  // Called by the webhook server / in-app buttons (CONFIRM, SKIP, MODIFY…)
  handleReply(messageBody) {
    const t  = (messageBody || "").trim();
    const up = t.toUpperCase();
    let result;
    if (up === "CONFIRM")              result = { action: "confirm" };
    else if (up === "SKIP")            result = { action: "skip" };
    else if (up === "PAUSE")           result = { action: "pause" };
    else if (up === "STOP")            result = { action: "stop" };
    else if (up.startsWith("MODIFY ")) result = { action: "modify", instruction: t.substring(7).trim() };
    else                               result = { action: "unknown", raw: t };

    console.log(`[Queue] Reply received: ${result.action}`);
    this.emit("confirmation", result);

    if (result.action === "pause")     this.paused = true;
    else if (result.action === "stop") this.running = false;

    if (this.resolver) {
      this.resolver(result);
      this.resolver = null;
    }
    if (this.paused && (result.action === "confirm" || result.action === "skip")) {
      this.paused = false;
      if (this.resumeResolver) { this.resumeResolver(); this.resumeResolver = null; }
    }
  }

  // Backwards-compatible alias (older code called this name)
  handleIncomingMessage(messageBody) { return this.handleReply(messageBody); }

  pause() {
    this.paused = true;
    if (this.resolver) { this.resolver({ action: "pause" }); this.resolver = null; }
  }

  resume() {
    this.paused = false;
    this.emit("queue:resumed");
    if (this.resumeResolver) { this.resumeResolver(); this.resumeResolver = null; }
    if (this.resolver)       { this.resolver({ action: "confirm" }); this.resolver = null; }
  }

  stop() {
    this.running = false;
    this.paused  = false;
    if (this.resolver)        { this.resolver({ action: "stop" }); this.resolver = null; }
    if (this.resumeResolver)  { this.resumeResolver(); this.resumeResolver = null; }
    if (this.browserResolver) { this.browserResolver(null); this.browserResolver = null; }
    this.emit("queue:stopped");
  }

  getStatus() {
    return { running: this.running, paused: this.paused, listId: this.listId };
  }
}

module.exports = new TaskQueueEngine();
