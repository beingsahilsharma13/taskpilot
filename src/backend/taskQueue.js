const EventEmitter = require("events");
const { v4: uuidv4 } = require("uuid");

function db()        { return require("../../database/db"); }
function ai()        { return require("./aiEngine"); }
function whatsapp()  { return require("./whatsapp"); }
function email()     { return require("./email"); }
function limiter()   { return require("./rateLimiter"); }

class TaskQueueEngine extends EventEmitter {
  constructor() {
    super();
    this.running   = false;
    this.paused    = false;
    this.listId    = null;
    this.resolver  = null; // resolves when user confirms on WhatsApp
  }

  // ── PUBLIC: Start running a list ───────────────────────────
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

  // ── INTERNAL: Run next pending task ────────────────────────
  async _runNext(listId, prevResponse) {
    const task = db().getNextPendingTask(listId);

    if (!task) {
      db().updateListStatus(listId, "completed");
      const list = db().getList(listId);
      this.emit("list:completed", { listId });
      await whatsapp().sendAllDone(list.name).catch(() => {});
      return;
    }

    // If paused — wait until resume is called
    if (this.paused) {
      this.emit("queue:paused", { taskId: task.id });
      await this._waitForResume();
      if (!this.running) return;
    }

    const allTasks = db().getTasksForList(listId);
    const position = task.position;
    const total    = allTasks.length;
    const list     = db().getList(listId);

    db().updateTaskStatus(task.id, "running");
    this.emit("task:started", { taskId: task.id, title: task.title, position, total });
    db().log(task.id, "STARTED", `provider=${task.ai_provider}`);

    try {
      // ── 1. Call AI ─────────────────────────────────────────
      const context = task.use_prev_context ? prevResponse : null;
      const aiResponse = await ai().run(task, context);

      db().updateTaskStatus(task.id, "waiting_confirm", aiResponse);
      db().log(task.id, "AI_DONE", aiResponse.substring(0, 200));
      this.emit("task:response", { taskId: task.id, response: aiResponse, position, total });

      // ── 2. Notify user (WhatsApp / email) ──────────────────
      await this._notify(task, aiResponse, position, total, list.name);

      // ── 3. Wait for user confirmation ──────────────────────
      this.emit("task:waiting", { taskId: task.id });
      const confirm = await this._waitForConfirm();

      // ── 4. Handle user reply ───────────────────────────────
      if (confirm.action === "confirm") {
        db().updateTaskStatus(task.id, "done");
        db().log(task.id, "CONFIRMED");
        this.emit("task:done", { taskId: task.id });
        await this._runNext(listId, aiResponse); // pass response as context for next

      } else if (confirm.action === "modify") {
        // Re-run same task with user's modification appended
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

  // ── Send to WhatsApp or Email ───────────────────────────────
  async _notify(task, response, position, total, listName) {
    const wa = whatsapp();
    const em = email();
    if (wa.isReady()) {
      await wa.sendTaskResult({ taskTitle: task.title, aiResponse: response, position, total, listName });
    } else if (em.isReady()) {
      await em.sendTaskResult(task.title, response, position, total, "http://localhost:3456/confirm");
    } else {
      console.warn("[Queue] No notification channel configured!");
      this.emit("queue:warn", { message: "No WhatsApp/Email configured. Confirm in the app." });
    }
  }

  // ── Wait for WhatsApp confirmation (returns Promise) ────────
  _waitForConfirm() {
    return new Promise(resolve => { this.resolver = resolve; });
  }

  _waitForResume() {
    return new Promise(resolve => { this.resumeResolver = resolve; });
  }

  // ── Called by webhook server when user replies on WhatsApp ──
  handleReply(messageBody) {
    const parsed = require("./whatsapp").constructor
      ? { action: "unknown" }
      : {};

    // Parse inline since we can't call static easily
    const t = (messageBody || "").trim();
    const up = t.toUpperCase();
    let result;
    if (up === "CONFIRM")          result = { action: "confirm" };
    else if (up === "SKIP")        result = { action: "skip" };
    else if (up === "PAUSE")       result = { action: "pause" };
    else if (up === "STOP")        result = { action: "stop" };
    else if (up.startsWith("MODIFY ")) result = { action: "modify", instruction: t.substring(7).trim() };
    else                           result = { action: "unknown", raw: t };

    console.log(`[Queue] Reply received: ${result.action}`);
    this.emit("confirmation", result);

    if (result.action === "pause") {
      this.paused = true;
    } else if (result.action === "stop") {
      this.running = false;
    }

    if (this.resolver) {
      this.resolver(result);
      this.resolver = null;
    }

    // If paused and user sends CONFIRM/SKIP, resume
    if (this.paused && (result.action === "confirm" || result.action === "skip")) {
      this.paused = false;
      if (this.resumeResolver) {
        this.resumeResolver();
        this.resumeResolver = null;
      }
    }
  }

  // ── External controls ───────────────────────────────────────
  pause()  { this.paused = true; if (this.resolver) { this.resolver({ action: "pause" }); this.resolver = null; } }
  resume() {
    this.paused = false;
    this.emit("queue:resumed");
    if (this.resumeResolver) { this.resumeResolver(); this.resumeResolver = null; }
    if (this.resolver)       { this.resolver({ action: "confirm" }); this.resolver = null; }
  }
  stop()   {
    this.running = false; this.paused = false;
    if (this.resolver)      { this.resolver({ action: "stop" }); this.resolver = null; }
    if (this.resumeResolver){ this.resumeResolver(); this.resumeResolver = null; }
    this.emit("queue:stopped");
  }

  getStatus() {
    return { running: this.running, paused: this.paused, listId: this.listId };
  }
}

module.exports = new TaskQueueEngine();
