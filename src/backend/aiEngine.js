const Anthropic = require("@anthropic-ai/sdk");
const OpenAI    = require("openai");
const rateLimiter = require("./rateLimiter");

class AIEngine {
  constructor() {
    this.anthropic = null;
    this.openai    = null;
  }

  init(claudeKey, openaiKey) {
    if (claudeKey) this.anthropic = new Anthropic({ apiKey: claudeKey });
    if (openaiKey) this.openai    = new OpenAI({ apiKey: openaiKey });
    console.log(`[AIEngine] Initialized — Claude:${!!claudeKey} OpenAI:${!!openaiKey}`);
  }

  // Run a task — main entry point
  async run(task, prevResponse = null) {
    await rateLimiter.waitIfLimited();

    const provider = (task.ai_provider || "claude").toLowerCase();
    const prompt   = this.buildPrompt(task, prevResponse);

    console.log(`[AIEngine] Running "${task.title}" on ${provider}`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = provider === "openai"
          ? await this.runOpenAI(prompt, task.ai_model)
          : await this.runClaude(prompt, task.ai_model);
        return result;
      } catch (err) {
        const isRateLimit = err?.status === 429 || String(err?.message).includes("rate_limit");
        if (isRateLimit && attempt < 3) {
          const wait = RateLimiter.parseRetryAfter(err);
          rateLimiter.hit(wait, provider);
          await rateLimiter.waitIfLimited();
          continue;
        }
        throw err;
      }
    }
  }

  buildPrompt(task, prevResponse) {
    if (task.use_prev_context && prevResponse) {
      return `Context from previous task:\n\n${prevResponse}\n\n---\n\nNew task:\n${task.prompt}`;
    }
    return task.prompt;
  }

  async runClaude(prompt, model = "claude-sonnet-4-20250514") {
    if (!this.anthropic) throw new Error("Claude API key not set. Go to Settings.");
    const res = await this.anthropic.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content[0].text;
  }

  async runOpenAI(prompt, model = "gpt-4o") {
    if (!this.openai) throw new Error("OpenAI API key not set. Go to Settings.");
    const res = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });
    return res.choices[0].message.content;
  }
}

// Fix reference to class method
const { RateLimiter } = rateLimiter.constructor ? { RateLimiter: { parseRetryAfter: (e) => { const h = e?.headers?.['retry-after']; return h ? parseInt(h) : 60; } } } : {};

module.exports = new AIEngine();
