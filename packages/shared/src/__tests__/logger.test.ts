import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "../logger.js";
import { HttpMetrics, renderMetrics } from "../metrics.js";

function capture(options: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: Array<{ level: LogLevel; line: string }> = [];
  const logger = createLogger({ service: "test", now: () => new Date("2026-10-07T00:00:00.000Z"), sink: (level, line) => lines.push({ level, line }), ...options });
  return { lines, logger };
}

describe("structured logger", () => {
  it("writes one JSON object per line with reserved keys that fields cannot override", () => {
    const { lines, logger } = capture();
    logger.info("job done", { jobId: "j1", msg: "spoofed", level: "debug" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.line)).toEqual({ jobId: "j1", ts: "2026-10-07T00:00:00.000Z", level: "info", service: "test", msg: "job done" });
  });

  it("redacts secrets, serializes errors and truncates long strings", () => {
    const { lines, logger } = capture();
    logger.error("failed", { password: "hunter2", nested: { apiKey: "k", ok: 1 }, error: new Error("boom"), body: "x".repeat(5000) });
    const parsed = JSON.parse(lines[0]!.line) as Record<string, any>;
    expect(parsed.password).toBe("[redacted]");
    expect(parsed.nested).toEqual({ apiKey: "[redacted]", ok: 1 });
    expect(parsed.error).toMatchObject({ name: "Error", message: "boom" });
    expect(parsed.body.length).toBeLessThan(2100);
    expect(lines[0]!.level).toBe("error");
  });

  it("respects the level threshold and carries child fields", () => {
    const { lines, logger } = capture({ level: "warn" });
    logger.child({ requestId: "r1" }).info("skipped");
    logger.child({ requestId: "r1" }).warn("kept", { a: 1 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.line)).toMatchObject({ requestId: "r1", a: 1, level: "warn" });
  });
});

describe("metrics", () => {
  it("renders Prometheus text with escaped labels", () => {
    const text = renderMetrics([{ name: "m_total", help: "h", type: "counter", samples: [{ labels: { q: 'a"b' }, value: 3 }, { value: Number.NaN }] }]);
    expect(text).toBe('# HELP m_total h\n# TYPE m_total counter\nm_total{q="a\\"b"} 3\nm_total 0\n');
  });

  it("keeps HTTP label cardinality bounded and buckets cumulative", () => {
    const http = new HttpMetrics();
    http.record("get", 200, 20);
    http.record("GET", 404, 300);
    http.record("POST", 500, 20_000);
    const metrics = http.toMetrics();
    const requests = metrics.find((metric) => metric.name === "content_agent_http_requests_total")!;
    expect(requests.samples).toEqual([
      { labels: { method: "GET", status: "2xx" }, value: 1 },
      { labels: { method: "GET", status: "4xx" }, value: 1 },
      { labels: { method: "POST", status: "5xx" }, value: 1 }
    ]);
    const buckets = metrics.find((metric) => metric.name.endsWith("_bucket"))!.samples;
    expect(buckets.at(-1)).toEqual({ labels: { le: "+Inf" }, value: 3 });
    expect(buckets.find((sample) => sample.labels?.le === "0.05")?.value).toBe(1);
    expect(buckets.find((sample) => sample.labels?.le === "0.5")?.value).toBe(2);
  });
});
