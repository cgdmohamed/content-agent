import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "../login-rate-limit";

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

