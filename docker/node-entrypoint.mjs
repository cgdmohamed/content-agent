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

if (!target) {
  console.error("[startup] missing target module");
  process.exit(1);
}

console.info(`[startup:${label}] loading ${target}`);

try {
  await import(new URL(target, `file://${process.cwd()}/`));
} catch (error) {
  console.error(`[startup:${label}] failed to load ${target}`);
  console.error(formatError(error));
  process.exit(1);
}
