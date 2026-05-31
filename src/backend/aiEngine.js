const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const rateLimiter = require("./rateLimiter");

class AIEngine {
  constructor() {
    this.anthropic = null;
    this.openai = null;
  }

  init(claudeApiKey, openaiApiKey) {
    if (claudeApiKey) this.anthropic = new Anthropic({ apiKey: claudeApiKey });
    if (openaiApiKey) this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  // Main method: run a task prompt on chosen AI provider
  async run(task, prevTaskResponse = null) {
    await rateLimiter.waitIfLimited();

    const prompt = this.buildPrompt(task, prevTaskResponse);
    const provider = task.ai_provider || "claude";

    console.log(`[AIEngine] Running task "${task.title}" on ${provider}`);

    try {
      if (provider === "claude") {
        return await this.runClaude(prompt, task.ai_model);
      } else {
        return await this.runOpenAI(prompt, task.ai_model);
      }
    } catch (error) {
      return this.handleError(error, task, prevTaskResponse, provider);
    }
  }

  buildPrompt(task, prevTaskResponse) {
    let prompt = task.prompt;
    // If this task is linked to previous and prev response exists, inject it as context
    if (task.use_prev_context && prevTaskResponse) {
      prompt = `Context from previous task:\n\n${prevTaskResponse}\n\n---\n\nYour task:\n${task.prompt}`;
    }
    return prompt;
  }

  async runClaude(prompt, model = "claude-sonnet-4-20250514") {
    if (!this.anthropic) throw new Error("Claude API key not configured");

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }]
    });

    return response.content[0].text;
  }

  async runOpenAI(prompt, model = "gpt-4o") {
    if (!this.openai) throw new Error("OpenAI API key not configured");

    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048
    });

    return response.choices[0].message.content;
  }

  async handleError(error, task, prevTaskResponse, provider) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limit_exceeded";

    if (isRateLimit) {
      const waitSecs = require("./rateLimiter").constructor.parseRetryAfter
        ? require("./rateLimiter").constructor.parseRetryAfter(error)
        : 60;
      rateLimiter.hit(waitSecs, provider);
      // Wait and retry once
      await rateLimiter.waitIfLimited();
      return this.run(task, prevTaskResponse);
    }

    console.error(`[AIEngine] Error:`, error.message);
    throw error;
  }
}

module.exports = new AIEngine();
