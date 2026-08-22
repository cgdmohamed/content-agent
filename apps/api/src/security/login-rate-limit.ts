export interface LoginRateLimitInput {
  email: string;
  ip: string;
  now?: number;
}

export interface LoginRateLimitConfig {
  windowMs: number;
  maxAttemptsPerEmail: number;
  maxAttemptsPerIp: number;
  maxEntries: number;
}

interface AttemptBucket {
  count: number;
  resetAt: number;
}

const defaultConfig: LoginRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxAttemptsPerEmail: 5,
  maxAttemptsPerIp: 25,
  maxEntries: 5000
};

export class LoginRateLimiter {
  private readonly buckets = new Map<string, AttemptBucket>();
  private readonly config: LoginRateLimitConfig;

  constructor(config: Partial<LoginRateLimitConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  assertAllowed(input: LoginRateLimitInput): void {
    const now = input.now ?? Date.now();
    this.removeExpired(now);
    const emailBucket = this.buckets.get(this.emailKey(input.email));
    const ipBucket = this.buckets.get(this.ipKey(input.ip));
    if (emailBucket && emailBucket.count >= this.config.maxAttemptsPerEmail) throw new Error("EMAIL_LIMITED");
    if (ipBucket && ipBucket.count >= this.config.maxAttemptsPerIp) throw new Error("IP_LIMITED");
  }

  recordFailure(input: LoginRateLimitInput): void {
    const now = input.now ?? Date.now();
    this.removeExpired(now);
    this.increment(this.emailKey(input.email), now);
    this.increment(this.ipKey(input.ip), now);
    this.trimOldest();
  }

  clear(input: LoginRateLimitInput): void {
    this.buckets.delete(this.emailKey(input.email));
  }

  private increment(key: string, now: number): void {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.config.windowMs });
      return;
    }
    existing.count += 1;
  }

  private removeExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt < now) this.buckets.delete(key);
    }
  }

  private trimOldest(): void {
    while (this.buckets.size > this.config.maxEntries) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.buckets.delete(oldestKey);
    }
  }

  private emailKey(email: string): string {
    return `email:${email.trim().toLowerCase()}`;
  }

  private ipKey(ip: string): string {
    return `ip:${ip.trim() || "unknown"}`;
  }
}

