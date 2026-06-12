/**
 * AI Engine — runs prompts on Claude (Anthropic) or ChatGPT (OpenAI).
 *
 * Default Claude model: Claude Fable 5 ("claude-fable-5") — Anthropic's
 * newest and most intelligent model. If the API key does not have access
 * yet, it automatically falls back to Claude Sonnet 4.6.
 */
const Anthropic   = require("@anthropic-ai/sdk");
const OpenAI      = require("openai");
const rateLimiter = require("./rateLimiter");

const DEFAULT_CLAUDE_MODEL  = "claude-fable-5";
const FALLBACK_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL  = "gpt-4o";

function parseRetryAfter(err) {
  const h = err?.headers?.["retry-after"] || err?.response?.headers?.["retry-after"];
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n : 60;
}

class AIEngine {
  constructor() {
    this.anthropic = null;
    this.openai    = null;
  }

  init(claudeKey, openaiKey) {
    if (claudeKey) this.anthropic = new Anthropic({ apiKey: claudeKey });
    if (openaiKey) this.openai    = new OpenAI({ apiKey: openaiKey });
    console.log(`[AIEngine] Ready — Claude:${!!claudeKey} OpenAI:${!!openaiKey} | model: ${DEFAULT_CLAUDE_MODEL}`);
  }

  // Main entry — run a task, with auto-retry on rate limits
  async run(task, prevResponse = null) {
    await rateLimiter.waitIfLimited();
    const provider = (task.ai_provider || "claude").toLowerCase();
    const prompt   = this.buildPrompt(task, prevResponse);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return provider === "openai"
          ? await this.runOpenAI(prompt, task.ai_model)
          : await this.runClaude(prompt, task.ai_model);
      } catch (err) {
        const isRateLimit = err?.status === 429 || String(err?.message || "").includes("rate_limit");
        if (isRateLimit && attempt < 3) {
          rateLimiter.hit(parseRetryAfter(err), provider);
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

  async runClaude(prompt, model) {
    if (!this.anthropic) throw new Error("Claude API key not set. Go to Settings.");
    const useModel = model || DEFAULT_CLAUDE_MODEL;
    try {
      const res = await this.anthropic.messages.create({
        model: useModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content[0].text;
    } catch (err) {
      // Graceful fallback if Fable 5 is not enabled on this API key yet
      if (err?.status === 404 && useModel === DEFAULT_CLAUDE_MODEL) {
        console.warn(`[AIEngine] ${DEFAULT_CLAUDE_MODEL} unavailable — falling back to ${FALLBACK_CLAUDE_MODEL}`);
        const res = await this.anthropic.messages.create({
          model: FALLBACK_CLAUDE_MODEL,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        });
        return res.content[0].text;
      }
      throw err;
    }
  }

  async runOpenAI(prompt, model) {
    if (!this.openai) throw new Error("OpenAI API key not set. Go to Settings.");
    const res = await this.openai.chat.completions.create({
      model: model || DEFAULT_OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });
    return res.choices[0].message.content;
  }

  // Multi-turn chat for the in-app Chat tab
  async chat(provider, messages) {
    await rateLimiter.waitIfLimited();

    if ((provider || "claude") === "openai") {
      if (!this.openai) throw new Error("OpenAI API key not set. Go to Settings.");
      const res = await this.openai.chat.completions.create({
        model: DEFAULT_OPENAI_MODEL, messages, max_tokens: 1024,
      });
      return res.choices[0].message.content;
    }

    if (!this.anthropic) throw new Error("Claude API key not set. Go to Settings.");
    try {
      const res = await this.anthropic.messages.create({
        model: DEFAULT_CLAUDE_MODEL,
        max_tokens: 1024,
        system: "You are a helpful AI assistant inside TaskPilot, a daily task automation app built by Sahil Sharma. Be concise and helpful.",
        messages,
      });
      return res.content[0].text;
    } catch (err) {
      if (err?.status === 404) {
        const res = await this.anthropic.messages.create({
          model: FALLBACK_CLAUDE_MODEL, max_tokens: 1024, messages,
        });
        return res.content[0].text;
      }
      throw err;
    }
  }
}

module.exports = new AIEngine();
