import { describe, expect, it } from "vitest";
import { DistributedLoginRateLimiter, LoginRateLimiter } from "../login-rate-limit.js";

describe("login rate limit", () => {
  it("limits repeated failures for the same email", () => {
    const limiter = new LoginRateLimiter({ windowMs: 1000, maxAttemptsPerEmail: 2, maxAttemptsPerIp: 10, maxEntries: 100 });
    const input = { email: "Admin@Example.com", ip: "203.0.113.10", now: 1000 };

    limiter.recordFailure(input);
    limiter.recordFailure({ ...input, email: "admin@example.com" });

    expect(() => limiter.assertAllowed(input)).toThrow("EMAIL_LIMITED");
    expect(() => limiter.assertAllowed({ ...input, now: 3000 })).not.toThrow();
  });

  it("limits repeated failures from the same ip across different emails", () => {
    const limiter = new LoginRateLimiter({ windowMs: 1000, maxAttemptsPerEmail: 10, maxAttemptsPerIp: 2, maxEntries: 100 });

    limiter.recordFailure({ email: "one@example.com", ip: "203.0.113.10", now: 1000 });
    limiter.recordFailure({ email: "two@example.com", ip: "203.0.113.10", now: 1000 });

    expect(() => limiter.assertAllowed({ email: "three@example.com", ip: "203.0.113.10", now: 1000 })).toThrow("IP_LIMITED");
    expect(() => limiter.assertAllowed({ email: "three@example.com", ip: "203.0.113.11", now: 1000 })).not.toThrow();
  });
});


describe("distributed login rate limit", () => {
  function fakeRedis() {
    const store = new Map<string, number>();
    return {
      store,
      get: async (key: string) => (store.has(key) ? String(store.get(key)) : null),
      incr: async (key: string) => {
        store.set(key, (store.get(key) ?? 0) + 1);
        return store.get(key)!;
      },
      pexpire: async () => 1,
      del: async (key: string) => (store.delete(key) ? 1 : 0)
    };
  }

  it("shares counters through Redis and never stores raw emails or IPs in keys", async () => {
    const redis = fakeRedis();
    const config = { windowMs: 1000, maxAttemptsPerEmail: 2, maxAttemptsPerIp: 10, maxEntries: 100 };
    const first = new DistributedLoginRateLimiter(redis, config);
    const second = new DistributedLoginRateLimiter(redis, config); // another API instance
    const input = { email: "Admin@Example.com", ip: "203.0.113.10" };

    await first.recordFailure(input);
    await second.recordFailure({ ...input, email: "admin@example.com" });

    await expect(first.assertAllowed(input)).rejects.toThrow("EMAIL_LIMITED");
    expect([...redis.store.keys()].some((key) => key.includes("admin") || key.includes("203.0.113"))).toBe(false);

    await first.clear(input);
    await expect(second.assertAllowed(input)).resolves.toBeUndefined();
  });

  it("falls back to in-memory limiting when Redis is down", async () => {
    const broken = {
      get: async () => { throw new Error("down"); },
      incr: async () => { throw new Error("down"); },
      pexpire: async () => { throw new Error("down"); },
      del: async () => { throw new Error("down"); }
    };
    const limiter = new DistributedLoginRateLimiter(broken, { windowMs: 60_000, maxAttemptsPerEmail: 1, maxAttemptsPerIp: 10, maxEntries: 100 });
    const input = { email: "a@example.com", ip: "203.0.113.9" };

    await expect(limiter.assertAllowed(input)).resolves.toBeUndefined();
    await limiter.recordFailure(input);
    await expect(limiter.assertAllowed(input)).rejects.toThrow("EMAIL_LIMITED");
  });
});
