import { describe, expect, it } from "vitest";
import { readinessHttpStatus, readinessStatus } from "../health.module";

describe("health readiness", () => {
  it("requires PostgreSQL and Redis to be ready", () => {
    expect(readinessStatus({ postgres: "جاهز", redis: "جاهز" })).toBe("ok");
    expect(readinessStatus({ postgres: "جاهز", redis: "غير جاهز" })).toBe("degraded");
    expect(readinessStatus({ postgres: "غير جاهز", redis: "جاهز" })).toBe("degraded");
  });

  it("returns service-unavailable status for degraded readiness", () => {
    expect(readinessHttpStatus("ok")).toBe(200);
    expect(readinessHttpStatus("degraded")).toBe(503);
  });
});
