import { createDecipheriv } from "node:crypto";

export function decryptSecret(envelope: string): string {
  const keyRaw = process.env.ENCRYPTION_KEY_BASE64;
  if (!keyRaw) throw new Error("ENCRYPTION_KEY_BASE64 غير مهيأ.");
  const key = Buffer.from(keyRaw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY_BASE64 يجب أن يفك إلى 32 بايت.");
  const [ivRaw, tagRaw, encryptedRaw] = envelope.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("صيغة السر المشفر غير صالحة.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8");
}
