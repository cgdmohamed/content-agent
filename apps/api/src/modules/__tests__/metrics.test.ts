import { renderMetrics } from "@content-agent/shared";
import { describe, expect, it } from "vitest";
import { bearerMatches, buildAppMetrics, type MetricsSnapshot } from "../metrics.module.js";

const snapshot: MetricsSnapshot = {
  contentByStatus: [{ status: "PUBLISHED", count: 4 }],
  jobsByStatus: [{ queue: "content-writing", status: "FAILED", count: 2 }],
  failedJobsLastHour: 2,
  oldestWaitingJobSeconds: 12,
  aiSpendMonthUsd: 3.5,
  workerHeartbeat: String(1_000_000),
  uptimeSeconds: 60,
  now: 1_010_000
};

describe("metrics endpoint", () => {
  it("maps a snapshot to Prometheus metrics including worker liveness", () => {
    const text = renderMetrics(buildAppMetrics(snapshot));
    expect(text).toContain('content_agent_content_items{status="PUBLISHED"} 4');
    expect(text).toContain('content_agent_jobs{queue="content-writing",status="FAILED"} 2');
    expect(text).toContain("content_agent_worker_up 1");
    expect(text).toContain("content_agent_worker_heartbeat_age_seconds 10");
    expect(text).toContain("content_agent_ai_spend_month_usd 3.5");
  });

  it("reports a stale or missing worker heartbeat", () => {
    expect(renderMetrics(buildAppMetrics({ ...snapshot, now: 1_100_000 }))).toContain("content_agent_worker_up 0");
    const missing = renderMetrics(buildAppMetrics({ ...snapshot, workerHeartbeat: null }));
    expect(missing).toContain("content_agent_worker_up 0");
    expect(missing).toContain("content_agent_worker_heartbeat_age_seconds -1");
  });

  it("accepts only the exact bearer token", () => {
    expect(bearerMatches("Bearer s3cret-token-value", "s3cret-token-value")).toBe(true);
    expect(bearerMatches("Bearer s3cret-token-valuX", "s3cret-token-value")).toBe(false);
    expect(bearerMatches("s3cret-token-value", "s3cret-token-value")).toBe(false);
    expect(bearerMatches(undefined, "s3cret-token-value")).toBe(false);
  });
});
