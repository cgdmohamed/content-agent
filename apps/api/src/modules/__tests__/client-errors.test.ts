import { describe, expect, it } from "vitest";
import { formatClientError } from "../client-errors.module.js";

describe("formatClientError", () => {
  it("emits one JSON line with request context and strips control characters", () => {
    const line = formatClientError({ message: "boom\u0007\nline2", stack: "at x\u0000" }, { userId: "u1", requestId: "req-12345678" });
    expect(line.includes("\n")).toBe(false);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ source: "web", userId: "u1", requestId: "req-12345678", message: "boom\nline2" });
    expect(parsed.stack).toBe("at x");
  });
});
