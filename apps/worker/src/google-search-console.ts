import { createSign } from "node:crypto";
import { decryptSecret } from "./secrets.js";

export interface GscSite {
  id: string;
  gsc_property: string | null;
  gsc_service_account_encrypted: string | null;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";

export async function fetchGscQueries(site: GscSite, startDate: string, endDate: string, rowLimit = 250): Promise<GscQueryRow[]> {
  if (!site.gsc_property || !site.gsc_service_account_encrypted) {
    throw new Error("بيانات Google Search Console غير مكتملة.");
  }
  const token = await getAccessToken(decryptSecret(site.gsc_service_account_encrypted));
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gsc_property)}/searchAnalytics/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const data = (await response.json()) as {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(`فشل جلب بيانات Google Search Console برمز ${response.status}.`);
  return (data.rows ?? [])
    .map((row) => ({
      query: row.keys?.[0] ?? "",
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      ctr: row.ctr ?? 0,
      position: row.position ?? 0
    }))
    .filter((row) => row.query.trim().length > 0);
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const account = parseServiceAccountJson(serviceAccountJson);
  const tokenUri = safeGoogleTokenUri(account.token_uri);
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    },
    account.private_key
  );
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(`فشل اتصال Google OAuth برمز ${response.status}.`);
  return data.access_token;
}

function parseServiceAccountJson(value: string): ServiceAccountJson {
  let parsed: Partial<ServiceAccountJson>;
  try {
    parsed = JSON.parse(value) as Partial<ServiceAccountJson>;
  } catch {
    throw new Error("ملف حساب الخدمة يجب أن يكون JSON صالحًا.");
  }
  if (typeof parsed.client_email !== "string" || !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/i.test(parsed.client_email)) {
    throw new Error("بريد حساب الخدمة غير صالح.");
  }
  if (typeof parsed.private_key !== "string" || !parsed.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("المفتاح الخاص في حساب الخدمة غير صالح.");
  }
  return { client_email: parsed.client_email.trim(), private_key: parsed.private_key, token_uri: parsed.token_uri };
}

function safeGoogleTokenUri(value: string | undefined): string {
  if (!value) return defaultGoogleTokenUri;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "oauth2.googleapis.com" || url.pathname !== "/token") {
    throw new Error("token_uri في حساب الخدمة يجب أن يشير إلى Google OAuth.");
  }
  return url.toString();
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string): string {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey, "base64url")}`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
