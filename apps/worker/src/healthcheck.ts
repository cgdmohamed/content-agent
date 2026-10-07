// Docker healthcheck: exits 0 only when the worker has written a fresh heartbeat to Redis.
import { Redis } from "ioredis";
import { workerHeartbeatKey, workerIsAlive } from "@content-agent/shared";

const url = process.env.REDIS_URL;
if (!url) process.exit(1);

const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, commandTimeout: 3000 });
client.on("error", () => undefined);

try {
  await client.connect();
  const alive = workerIsAlive(await client.get(workerHeartbeatKey));
  client.disconnect();
  process.exit(alive ? 0 : 1);
} catch {
  client.disconnect();
  process.exit(1);
}
