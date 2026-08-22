import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function key(): Buffer {
  const value = process.env.ENCRYPTION_KEY_BASE64;
  if (!value) throw new Error("ENCRYPTION_KEY_BASE64 مطلوب.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("ENCRYPTION_KEY_BASE64 يجب أن يفك إلى 32 بايت.");
  return decoded;
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(envelope: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = envelope.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("صيغة السر المشفر غير صالحة.");
  const decipher = createDecipheriv(algorithm, key(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8");
}
