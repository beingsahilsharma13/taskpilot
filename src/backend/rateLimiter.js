const EventEmitter = require('events');

class RateLimiter extends EventEmitter {
  constructor() {
    super();
    this.isLimited = false;
    this.retryAfterMs = 0;
    this.retryTimer = null;
    this.limitStartTime = null;
  }

  hit(retryAfterSeconds = 60, provider = 'claude') {
    if (this.isLimited) return;
    this.isLimited = true;
    this.limitStartTime = Date.now();
    this.retryAfterMs = retryAfterSeconds * 1000;
    console.log(`[RateLimiter] ${provider} rate limit hit. Waiting ${retryAfterSeconds}s...`);
    this.emit('limited', { provider, retryAfterSeconds, resumeAt: new Date(Date.now() + this.retryAfterMs) });
    this.retryTimer = setTimeout(() => this.reset(provider), this.retryAfterMs);
  }

  reset(provider = 'unknown') {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.isLimited = false; this.retryAfterMs = 0;
    this.limitStartTime = null; this.retryTimer = null;
    console.log(`[RateLimiter] ${provider} rate limit cleared. Resuming...`);
    this.emit('resumed', { provider });
  }

  getTimeRemaining() {
    if (!this.isLimited || !this.limitStartTime) return 0;
    return Math.max(0, this.retryAfterMs - (Date.now() - this.limitStartTime));
  }

  async waitIfLimited() {
    if (!this.isLimited) return;
    const remaining = this.getTimeRemaining();
    if (remaining <= 0) { this.reset(); return; }
    console.log(`[RateLimiter] Waiting ${Math.ceil(remaining / 1000)}s...`);
    await new Promise(resolve => {
      const check = () => !this.isLimited ? resolve() : setTimeout(check, 1000);
      check();
    });
  }

  static parseRetryAfter(error) {
    if (error?.status === 429) {
      const h = error?.headers?.['retry-after'];
      return h ? parseInt(h, 10) : 60;
    }
    return 60;
  }
}

module.exports = new RateLimiter();
