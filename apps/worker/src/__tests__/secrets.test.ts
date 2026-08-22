import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret } from "../secrets";

process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");

describe("worker secret decryption", () => {
  it("decrypts the AES-GCM envelope format stored by the API", () => {
    const secret = "gsc-service-account-json";
    const envelope = encryptEnvelope(secret);

    expect(decryptSecret(envelope)).toBe(secret);
  });

  it("rejects malformed envelopes before integration calls use them", () => {
    expect(() => decryptSecret("not-a-valid-envelope")).toThrow("صيغة السر المشفر غير صالحة.");
  });
});

function encryptEnvelope(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.alloc(32, 7), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
