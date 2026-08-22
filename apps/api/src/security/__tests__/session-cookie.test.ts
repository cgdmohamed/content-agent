import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionCookie, parseSessionCookie } from "../session-cookie.js";
import { isTrustedWriteSource } from "../access-control.js";

process.env.SESSION_SECRET = "test-secret-value-with-more-than-32-characters";
const testSecret = process.env.SESSION_SECRET;

describe("session security", () => {
  it("parses a signed session cookie and rejects tampering", () => {
    const cookie = createSessionCookie({
      id: "user-1",
      name: "مدير",
      email: "admin@example.com",
      role: "ADMIN"
    });

    expect(parseSessionCookie(cookie)?.email).toBe("admin@example.com");
    expect(parseSessionCookie(`${cookie}x`)).toBeNull();
  });

  it("rejects signed cookies with malformed or incomplete payloads", () => {
    expect(parseSessionCookie(signedPayload("not-json"))).toBeNull();
    expect(parseSessionCookie(signedPayload(JSON.stringify({ id: "user-1", role: "ADMIN", exp: Date.now() + 1000 })))).toBeNull();
    expect(parseSessionCookie(signedPayload(JSON.stringify({ id: "user-1", name: "مدير", email: "admin@example.com", role: "OWNER", exp: Date.now() + 1000 })))).toBeNull();
  });

  it("accepts only the configured web origin for write requests", () => {
    expect(isTrustedWriteSource("https://content.example.com/app", "https://content.example.com")).toBe(true);
    expect(isTrustedWriteSource("https://evil.example.com", "https://content.example.com")).toBe(false);
    expect(isTrustedWriteSource(undefined, "https://content.example.com")).toBe(false);
  });
});

function signedPayload(value: string): string {
  const payload = Buffer.from(value).toString("base64url");
  const signature = createHmac("sha256", testSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
