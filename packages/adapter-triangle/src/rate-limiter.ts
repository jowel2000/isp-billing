/**
 * Small token bucket. Requests are serialized by default so the adapter
 * never opens parallel sessions against the upstream panel.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMinute: number,
  ) {
    this.tokens = capacity;
  }

  async acquire(): Promise<void> {
    const run = this.queue.then(() => this.take());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async take(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerMinute) * 60_000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastRefill) / 60_000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMinutes * this.refillPerMinute);
    this.lastRefill = now;
  }
}
