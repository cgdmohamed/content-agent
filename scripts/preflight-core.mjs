export function parseEnvFile(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function productionWarnings(env, raw) {
  if (env.NODE_ENV !== "production") return [];
  const warnings = [];
  for (const key of ["POSTGRES_PASSWORD", "ENCRYPTION_KEY_BASE64", "BOOTSTRAP_ADMIN_PASSWORD"]) {
    if (placeholderSecret(raw[key]) || decodedPlaceholderSecret(key, raw[key])) warnings.push(`${key} يجب تغييره قبل الإنتاج.`);
  }
  if (!String(raw.POSTGRES_PASSWORD ?? "").trim()) {
    warnings.push("POSTGRES_PASSWORD مطلوب في الإنتاج.");
  } else if (String(raw.POSTGRES_PASSWORD).length < 16) {
    warnings.push("POSTGRES_PASSWORD يجب أن يكون أطول وأقوى قبل الإنتاج.");
  }
  if (env.PUBLIC_WEB_URL.startsWith("http://")) {
    warnings.push("PUBLIC_WEB_URL يجب أن يستخدم HTTPS في الإنتاج حتى تعمل كوكي الجلسة الآمنة.");
  }
  if (localhostUrl(env.DATABASE_URL)) {
    warnings.push("DATABASE_URL يشير إلى localhost؛ استخدم اسم خدمة قاعدة البيانات داخل Docker مثل postgres.");
  }
  if (localhostUrl(env.REDIS_URL)) {
    warnings.push("REDIS_URL يشير إلى localhost؛ استخدم اسم خدمة Redis داخل Docker مثل redis.");
  }
  if (String(raw.POSTGRES_PASSWORD ?? "").trim() && databasePassword(env.DATABASE_URL) !== String(raw.POSTGRES_PASSWORD)) {
    warnings.push("DATABASE_URL لا يبدو أنه يستخدم POSTGRES_PASSWORD الحالي.");
  }
  if (urlHostname(env.DATABASE_URL) !== "postgres") {
    warnings.push("DATABASE_URL يجب أن يستخدم اسم خدمة PostgreSQL الداخلي: postgres.");
  }
  if (urlHostname(env.REDIS_URL) !== "redis") {
    warnings.push("REDIS_URL يجب أن يستخدم اسم خدمة Redis الداخلي: redis.");
  }
  return warnings;
}

function placeholderSecret(value) {
  const lower = String(value ?? "").toLowerCase();
  return lower.includes("replace") || lower.includes("change");
}

function decodedPlaceholderSecret(key, value) {
  if (key !== "ENCRYPTION_KEY_BASE64") return false;
  try {
    return placeholderSecret(Buffer.from(String(value ?? ""), "base64").toString("utf8"));
  } catch {
    return false;
  }
}

function localhostUrl(value) {
  const host = urlHostname(value);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function urlHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function databasePassword(value) {
  try {
    return decodeURIComponent(new URL(value).password);
  } catch {
    return "";
  }
}
