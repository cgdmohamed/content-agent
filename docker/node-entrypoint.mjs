const [, , target, label = "service"] = process.argv;

function formatError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

process.on("uncaughtException", (error) => {
  console.error(`[startup:${label}] uncaught exception`);
  console.error(formatError(error));
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(`[startup:${label}] unhandled rejection`);
  console.error(formatError(error));
  process.exit(1);
});

process.on("beforeExit", (code) => {
  console.error(`[startup:${label}] beforeExit code=${code}`);
});

process.on("exit", (code) => {
  console.error(`[startup:${label}] exit code=${code}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.error(`[startup:${label}] received ${signal}`);
  });
}

if (!target) {
  console.error("[startup] missing target module");
  process.exit(1);
}

console.info(`[startup:${label}] loading ${target}`);

try {
  validateRuntimeEnv(label);
  await import(new URL(target, `file://${process.cwd()}/`));
} catch (error) {
  console.error(`[startup:${label}] failed to load ${target}`);
  console.error(formatError(error));
  process.exit(1);
}

function validateRuntimeEnv(label) {
  console.info(`[startup:${label}] validating runtime environment`);
  const issues = [];
  requireValue("DATABASE_URL", issues);
  requireValue("REDIS_URL", issues);
  requireValue("SESSION_SECRET", issues, (value) => value.length >= 32, "must be at least 32 characters");
  requireValue("ENCRYPTION_KEY_BASE64", issues, isThirtyTwoByteBase64, "must decode to exactly 32 bytes");
  requireUrl("PUBLIC_WEB_URL", issues);
  requireUrl("DATABASE_URL", issues);
  requireUrl("REDIS_URL", issues);
  if (process.env.BOOTSTRAP_ADMIN_EMAIL) requireEmail("BOOTSTRAP_ADMIN_EMAIL", issues);
  if (process.env.BOOTSTRAP_ADMIN_PASSWORD) requireValue("BOOTSTRAP_ADMIN_PASSWORD", issues, (value) => value.length >= 8, "must be at least 8 characters");
  if (issues.length > 0) {
    throw new Error(`Invalid runtime environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  console.info(`[startup:${label}] runtime environment is valid`);
}

function requireValue(name, issues, validate, message = "is required") {
  const value = process.env[name];
  if (!value) {
    issues.push(`${name}: ${message}`);
    return;
  }
  if (validate && !validate(value)) issues.push(`${name}: ${message}`);
}

function requireUrl(name, issues) {
  const value = process.env[name];
  if (!value) return;
  try {
    new URL(value);
  } catch {
    issues.push(`${name}: must be a valid URL`);
  }
}

function requireEmail(name, issues) {
  const value = process.env[name];
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) issues.push(`${name}: must be a valid email`);
}

function isThirtyTwoByteBase64(value) {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}
