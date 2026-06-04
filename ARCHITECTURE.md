# TaskPilot Architecture

## Overview

TaskPilot is a production-grade **AI-powered task automation platform** built with Electron, SQLite, and the Anthropic/OpenAI APIs. It allows users to automate repetitive tasks by delegating them to Claude or ChatGPT, with multi-channel delivery (Email/WhatsApp) and comprehensive execution history.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           IPC Bridge (preload.js)                    │   │
│  │  Secure communication between UI and backend         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌────────┐          ┌───────────┐         ┌─────────┐
    │   DB   │          │ AI Engine │         │  Email/ │
    │ Layer  │          │  (Claude  │         │ WhatsApp│
    │ SQLite │          │ + OpenAI) │         │Service  │
    └────────┘          └───────────┘         └─────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────────────┐
                    │ Execution       │
                    │ Service         │
                    │ (Orchestrator)  │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐    ┌──────────┐    ┌──────────┐
        │ Webhook │    │ Desktop  │    │ Rate     │
        │ Server  │    │Automation│    │ Limiter  │
        │(Express)│    │Service   │    │(Backoff) │
        └─────────┘    └──────────┘    └──────────┘
```

---

## Core Services

### 1. **Database Layer** (`database/db.js`)

- **SQLite** for persistent, local storage
- **Tables:**
  - `tasks` — task definitions
  - `executions` — execution history with timestamps and durations
  - `delivery_logs` — Email/WhatsApp delivery status
  - `system_logs` — application logs for debugging
  - `settings` — configuration key-value store

- **Key Methods:**
  - `logExecution(execution)` — record task execution with AI response
  - `getExecutionHistory(taskId)` — retrieve all executions for a task
  - `getStats()` — dashboard metrics (total, running, completed, failed)
  - `logSystem(level, service, message)` — system logging

### 2. **AI Engine** (`src/backend/aiEngine.js`)

- Abstracts Claude and OpenAI APIs
- **Features:**
  - Per-task AI provider selection (Claude vs ChatGPT)
  - Context passing from previous task responses
  - Error handling with automatic retries
  - Rate limit detection and fallback

- **Methods:**
  - `run(task, prevResponse)` — execute task on chosen AI
  - `runClaude(prompt, model)` — call Claude API
  - `runOpenAI(prompt, model)` — call OpenAI API

### 3. **Execution Service** (`src/services/executionService.js`)

Orchestrates the complete workflow:

```
1. Submit prompt to AI
2. Capture full response
3. Store in SQLite
4. Deliver via Email/WhatsApp (or both)
5. Log delivery status
6. Update task status (completed/failed)
```

- **Methods:**
  - `executeTask(task)` — run task end-to-end
  - `deliver(mode, task, response)` — send via email or WhatsApp
  - `retry(executionId, task)` — retry failed execution

### 4. **Email Service** (`src/backend/email.js`)

- **Gmail** via SMTP (nodemailer)
- **Produces:** professional HTML emails with formatting
- **Features:**
  - Task name, prompt, and full AI response in email
  - Responsive design
  - Execution timestamp and status

### 5. **WhatsApp Service** (`src/backend/whatsapp.js`)

- **Twilio** SMS/WhatsApp integration
- **Features:**
  - Send task responses to WhatsApp
  - Confirmation handling (CONFIRM/MODIFY/SKIP)
  - Fallback to Email if WhatsApp fails

### 6. **Rate Limiter** (`src/backend/rateLimiter.js`)

- Monitors API rate limits (Claude & OpenAI)
- **Features:**
  - Detects 429 (too many requests) errors
  - Auto-pauses queue and waits for reset
  - Emits events for UI updates
  - Exponential backoff support

### 7. **Webhook Server** (`src/webhook/server.js`)

- **Express** server on port 3456
- Receives WhatsApp replies from Twilio
- Routes confirmations back to task queue
- Uses **ngrok** for local development tunneling

### 8. **Desktop Automation** (`src/services/desktopAutomation.js`)

- Launches Claude Desktop or Claude Web
- Cross-platform support (macOS/Windows/Linux)
- Uses AppleScript (macOS) for window focus
- Primarily used for user notifications

---

## Data Flow

### Task Execution Flow

```
User creates task (title + prompt)
    ↓
User selects: AI provider (Claude/ChatGPT) + delivery (Email/WhatsApp/Both)
    ↓
User clicks "Run"
    ↓
TaskQueue.executeTask(task)
    ↓
AIEngine.run(task)  →  Claude/OpenAI API
    ↓
Capture AI response (full text)
    ↓
db.logExecution({response, duration, status})
    ↓
ExecutionService.deliver(mode, task, response)
    │
    ├─→ Email: nodemailer → SMTP → Gmail
    │
    └─→ WhatsApp: Twilio API → User's WhatsApp
    ↓
Task status → "completed" / "failed"
    ↓
Dashboard refreshes with execution history
```

### Delivery Flow

```
ExecutionService picks delivery mode(s)
    ↓
For each mode (email, whatsapp):
    ├─→ Format message
    ├─→ Send via service
    ├─→ Log delivery status
    └─→ Emit event to UI
    ↓
Update delivery_logs table
    ↓
Emit "task:delivered" event with results
```

---

## Database Schema

### Executions Table

```sql
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  prompt TEXT,          -- Full prompt sent to AI
  ai_response TEXT,     -- Full response from Claude/GPT
  ai_provider TEXT,     -- "claude" or "openai"
  duration_ms INTEGER,  -- Time taken in milliseconds
  status TEXT,          -- "completed" or "failed"
  error TEXT,           -- Error message if failed
  delivery_status TEXT, -- JSON: {email: {...}, whatsapp: {...}}
  executed_at DATETIME
);
```

### Delivery Logs Table

```sql
CREATE TABLE delivery_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT,    -- Links to executions
  mode TEXT,            -- "email" or "whatsapp"
  status TEXT,          -- "success" or "failed"
  message TEXT,         -- Status details
  created_at DATETIME
);
```

### System Logs Table

```sql
CREATE TABLE system_logs (
  id TEXT PRIMARY KEY,
  level TEXT,           -- "info", "warn", "error"
  service TEXT,         -- Which service logged it
  message TEXT,         -- Log message
  stacktrace TEXT,      -- Error stacktrace if applicable
  created_at DATETIME
);
```

---

## IPC Communication (Electron)

### UI → Backend

```javascript
// Request execution history
await api.getExecutions();      // Returns array of executions

// Get dashboard stats
await api.getStats();           // {totalTasks, running, completed, failed}

// Get task summary
await api.getTaskSummary(taskId); // Success rate, duration, etc.

// Cleanup old logs
await api.cleanupLogs(30);      // Delete logs > 30 days old
```

### Backend → UI

```javascript
// Execution events
ipcMain.send('task:started', {taskId, title, position});
ipcMain.send('task:response', {taskId, response, duration});
ipcMain.send('task:completed', {taskId, executionId, deliveryStatus});
ipcMain.send('task:failed', {taskId, error});

// Delivery events
ipcMain.send('task:delivered', {taskId, mode, success});

// Rate limit events
ipcMain.send('rate:limited', {provider, retryAfterSeconds});
```

---

## Error Handling & Retry

### AI API Errors

- **Rate limit (429):** RateLimiter.hit() → auto-waits → retries
- **Auth error (401):** Logged, not retried (user must fix keys)
- **Network error:** Caught by try-catch, logged to system_logs

### Delivery Errors

- **Email fails:** Logged to delivery_logs, user sees "Failed" in UI
- **WhatsApp fails:** Falls back to email if configured
- **Both fail:** Task status → "completed_partial", user notified

### Recovery

- Dashboard shows failed tasks
- User can manually retry from UI
- `ExecutionService.retryExecution(executionId, task)` reruns

---

## Production Considerations

### Scalability

- **SQLite:** Fine for single-user desktop; replace with PostgreSQL for multi-user
- **Execution logging:** Auto-cleanup via `cleanupOldLogs(daysOld)`
- **Email:** Transactional email providers (SendGrid, Postmark) for scale

### Security

- API keys stored in `.env` (not committed to git)
- Sensitive fields in delivery logs masked
- Electron context isolation enabled (preload.js)
- IPC validation for all handler inputs

### Monitoring

- System logs tracked in `system_logs` table
- Dashboard exports execution history as CSV (future)
- Error notifications via email/WhatsApp

---

## File Structure

```
taskpilot/
├── main.js                    # Electron entry point
├── preload.js                 # IPC bridge (security)
├── database/
│   └── db.js                  # SQLite wrapper + helpers
├── src/
│   ├── backend/
│   │   ├── aiEngine.js        # Claude + OpenAI integration
│   │   ├── email.js           # Email service (nodemailer)
│   │   ├── whatsapp.js        # Twilio WhatsApp
│   │   ├── taskQueue.js       # Workflow orchestration
│   │   └── rateLimiter.js     # Rate limit handling
│   ├── services/
│   │   ├── executionService.js # Task execution orchestration
│   │   └── desktopAutomation.js # System integration
│   ├── ipc/
│   │   └── dashboardHandlers.js # IPC handlers for dashboard
│   ├── webhook/
│   │   └── server.js          # Express webhook (Twilio)
│   └── ui/
│       ├── index.html         # Main UI
│       └── dashboard.html     # Analytics dashboard
├── package.json
├── setup.js                   # Configuration setup script
└── .env.example               # Template
```

---

## SOLID Principles Applied

1. **Single Responsibility**
   - Each service has one job (AI, Email, WhatsApp, etc.)
   
2. **Open/Closed**
   - Easy to add new delivery modes (SMS, Slack, etc.)
   - Easy to support new AI providers
   
3. **Liskov Substitution**
   - AI providers (Claude, OpenAI) swap interchangeably
   
4. **Interface Segregation**
   - Services expose minimal public methods
   - IPC handlers are focused and single-purpose
   
5. **Dependency Inversion**
   - Services depend on abstractions (interfaces) not concrete implementations
   - Database layer abstracted via helpers

---

## Testing & QA

- Unit tests for AIEngine, RateLimiter, Email, WhatsApp
- Integration tests for ExecutionService workflow
- E2E tests for full task → delivery → confirmation
- Mock Twilio/SendGrid for CI/CD

---

## Future Enhancements

1. **Multi-user support:** PostgreSQL + Auth
2. **Scheduled tasks:** Cron integration
3. **Task chains:** DAGs for dependencies
4. **Webhooks:** Trigger tasks from external systems
5. **API:** REST endpoint for programmatic access
6. **Mobile app:** Companion React Native app
7. **Slack/Teams:** Additional delivery channels
8. **Analytics:** Advanced reporting and insights

