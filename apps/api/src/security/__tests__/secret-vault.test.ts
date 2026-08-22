import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../secret-vault";

process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");

describe("secret vault", () => {
  it("round-trips encrypted integration secrets without storing plaintext", () => {
    const secret = "wp-app-password:كلمة-سر-2026!";
    const envelope = encryptSecret(secret);

    expect(envelope).not.toContain(secret);
    expect(envelope.split(".")).toHaveLength(3);
    expect(decryptSecret(envelope)).toBe(secret);
  });

  it("rejects tampered encrypted envelopes", () => {
    const envelope = encryptSecret("service-account-json");
    const [iv, tag, encrypted] = envelope.split(".");
    const tamperedTag = Buffer.from(`${tag}x`).toString("base64");

    expect(() => decryptSecret(`${iv}.${tamperedTag}.${encrypted}`)).toThrow();
  });
});
