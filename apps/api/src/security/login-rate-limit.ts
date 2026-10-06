import { createHash } from "node:crypto";

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


/** The subset of ioredis used by the distributed limiter (kept narrow so tests can fake it). */
export interface RateLimitRedis {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  del(key: string): Promise<number>;
}

/**
 * Login limiter shared across API instances and restarts via Redis, with the in-memory limiter as a
 * fallback so that a Redis outage degrades protection instead of blocking every login.
 */
export class DistributedLoginRateLimiter {
  private readonly config: LoginRateLimitConfig;
  private readonly fallback: LoginRateLimiter;

  constructor(
    private readonly redis: RateLimitRedis,
    config: Partial<LoginRateLimitConfig> = {}
  ) {
    this.config = { ...defaultConfig, ...config };
    this.fallback = new LoginRateLimiter(config);
  }

  async assertAllowed(input: LoginRateLimitInput): Promise<void> {
    try {
      const [emailCount, ipCount] = await Promise.all([this.redis.get(this.emailKey(input.email)), this.redis.get(this.ipKey(input.ip))]);
      if (Number(emailCount ?? 0) >= this.config.maxAttemptsPerEmail) throw new Error("EMAIL_LIMITED");
      if (Number(ipCount ?? 0) >= this.config.maxAttemptsPerIp) throw new Error("IP_LIMITED");
    } catch (error) {
      if (error instanceof Error && (error.message === "EMAIL_LIMITED" || error.message === "IP_LIMITED")) throw error;
      this.fallback.assertAllowed(input);
    }
  }

  async recordFailure(input: LoginRateLimitInput): Promise<void> {
    try {
      await Promise.all([this.bump(this.emailKey(input.email)), this.bump(this.ipKey(input.ip))]);
    } catch {
      this.fallback.recordFailure(input);
    }
  }

  async clear(input: LoginRateLimitInput): Promise<void> {
    this.fallback.clear(input);
    try {
      await this.redis.del(this.emailKey(input.email));
    } catch {
      // Redis outage: the in-memory entry is already cleared.
    }
  }

  private async bump(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, this.config.windowMs);
  }

  private emailKey(email: string): string {
    return `login-limit:email:${digest(email.trim().toLowerCase())}`;
  }

  private ipKey(ip: string): string {
    return `login-limit:ip:${digest(ip.trim() || "unknown")}`;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
