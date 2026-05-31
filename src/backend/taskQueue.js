const EventEmitter = require("events");
const { v4: uuidv4 } = require("uuid");
const aiEngine = require("./aiEngine");
const whatsapp = require("./whatsapp");
const emailService = require("./email");
const rateLimiter = require("./rateLimiter");

// We require db lazily to avoid Electron context issues
function getDb() { return require("../../database/db"); }

class TaskQueueEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.isPaused = false;
    this.currentListId = null;
    this.currentTaskId = null;
    this.pendingConfirmation = false;
    this.confirmationResolver = null;
  }

  // ── Start running a task list ──────────────────────────────
  async start(listId) {
    if (this.isRunning) throw new Error("Queue already running");
    const db = getDb();
    const list = db.getList(listId);
    if (!list) throw new Error(`Task list not found: ${listId}`);

    this.isRunning = true;
    this.isPaused = false;
    this.currentListId = listId;

    db.updateListStatus(listId, "running");
    this.emit("list:started", { listId, name: list.name });

    console.log(`[TaskQueue] Starting list: ${list.name}`);

    try {
      await this.runNextTask(listId, null);
    } catch (err) {
      console.error("[TaskQueue] Fatal error:", err);
      this.emit("error", err);
    } finally {
      this.isRunning = false;
    }
  }

  // ── Run the next pending task recursively ──────────────────
  async runNextTask(listId, prevTaskResponse) {
    const db = getDb();
    const task = db.getNextPendingTask(listId);

    if (!task) {
      // All tasks done!
      db.updateListStatus(listId, "completed");
      this.emit("list:completed", { listId });
      await whatsapp.sendNotification("🎉 *TaskPilot* — All tasks completed! Great work!");
      console.log("[TaskQueue] All tasks done!");
      return;
    }

    if (this.isPaused) {
      console.log("[TaskQueue] Paused. Waiting for resume...");
      this.emit("queue:paused", { taskId: task.id });
      await new Promise(resolve => { this.confirmationResolver = resolve; });
    }

    this.currentTaskId = task.id;
    const tasks = db.getTasksForList(listId);
    const totalTasks = tasks.length;
    const position = task.position;

    // Mark as running
    db.updateTaskStatus(task.id, "running");
    this.emit("task:started", { taskId: task.id, title: task.title, position });
    db.log(task.id, "STARTED", `Running on ${task.ai_provider}`);

    try {
      // ── Call the AI ──────────────────────────────────────
      const context = task.use_prev_context ? prevTaskResponse : null;
      const aiResponse = await aiEngine.run(task, context);

      // Save response
      db.updateTaskStatus(task.id, "waiting_confirm", aiResponse);
      db.log(task.id, "AI_RESPONSE", aiResponse.substring(0, 300));
      this.emit("task:response", { taskId: task.id, response: aiResponse });

      // ── Send to user ─────────────────────────────────────
      await this.notifyUser(task, aiResponse, position, totalTasks);

      // ── Wait for confirmation ─────────────────────────────
      this.pendingConfirmation = true;
      this.emit("task:waiting_confirm", { taskId: task.id });
      const confirmation = await this.waitForConfirmation();
      this.pendingConfirmation = false;

      // ── Handle confirmation ───────────────────────────────
      if (confirmation.action === "confirm") {
        db.updateTaskStatus(task.id, "done");
        db.log(task.id, "CONFIRMED");
        this.emit("task:done", { taskId: task.id });
        await this.runNextTask(listId, aiResponse); // Pass response as context for next

      } else if (confirmation.action === "modify") {
        // Re-run the same task with user's modification
        db.updateTask(task.id, {
          status: "pending",
          prompt: `${task.prompt}\n\nUser modification: ${confirmation.instruction}`,
          user_modification: confirmation.instruction
        });
        db.log(task.id, "MODIFIED", confirmation.instruction);
        this.emit("task:modified", { taskId: task.id, instruction: confirmation.instruction });
        await this.runNextTask(listId, prevTaskResponse); // Re-run same task

      } else if (confirmation.action === "skip") {
        db.updateTaskStatus(task.id, "skipped");
        db.log(task.id, "SKIPPED");
        this.emit("task:skipped", { taskId: task.id });
        await this.runNextTask(listId, prevTaskResponse); // Move to next, no context from skipped

      } else if (confirmation.action === "pause") {
        this.isPaused = true;
        db.updateTaskStatus(task.id, "pending"); // Put back to pending
        db.updateListStatus(listId, "paused");
        db.log(task.id, "PAUSED");
        this.emit("queue:paused", { taskId: task.id });
      }

    } catch (err) {
      db.updateTaskStatus(task.id, "failed");
      db.log(task.id, "FAILED", err.message);
      this.emit("task:failed", { taskId: task.id, error: err.message });
      throw err;
    }
  }

  // ── Send response to WhatsApp or Email ─────────────────────
  async notifyUser(task, response, position, total) {
    if (task.notify_channel === "whatsapp" && whatsapp.isReady()) {
      await whatsapp.sendTaskResult(task.title, response, position, total);
    } else if (emailService.isReady()) {
      await emailService.sendTaskResult(task.title, response, position, total, "http://localhost:3456/confirm");
    } else {
      console.warn("[TaskQueue] No notification channel configured!");
    }
  }

  // ── Wait for WhatsApp/Email confirmation ───────────────────
  waitForConfirmation() {
    return new Promise(resolve => {
      this.confirmationResolver = resolve;
    });
  }

  // Called by webhook server when user replies on WhatsApp
  handleIncomingMessage(messageBody) {
    const parsed = whatsapp.parseConfirmation(messageBody);
    console.log(`[TaskQueue] Incoming confirmation: ${parsed.action}`);
    this.emit("confirmation:received", parsed);

    if (this.confirmationResolver) {
      this.confirmationResolver(parsed);
      this.confirmationResolver = null;
    }
  }

  pause() {
    this.isPaused = true;
    if (this.confirmationResolver) {
      this.confirmationResolver({ action: "pause" });
      this.confirmationResolver = null;
    }
  }

  resume() {
    this.isPaused = false;
    if (this.confirmationResolver) {
      this.confirmationResolver({ action: "confirm" });
      this.confirmationResolver = null;
    }
    this.emit("queue:resumed");
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.pendingConfirmation = false;
    this.currentListId = null;
    this.currentTaskId = null;
    if (this.confirmationResolver) {
      this.confirmationResolver({ action: "skip" });
      this.confirmationResolver = null;
    }
  }
}

module.exports = new TaskQueueEngine();
