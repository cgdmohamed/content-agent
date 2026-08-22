import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EDITOR";
  exp: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET يجب أن يكون 32 حرفًا على الأقل.");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionCookie(user: Omit<SessionUser, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionCookie(cookie: string | undefined): SessionUser | null {
  if (!cookie) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionUser>;
    if (!isSessionUser(parsed)) return null;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSessionUser(value: Partial<SessionUser>): value is SessionUser {
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.role === "ADMIN" || value.role === "EDITOR") &&
    typeof value.exp === "number" &&
    Number.isFinite(value.exp)
  );
}
