import { describe, expect, it } from "vitest";
import { canCancelJobStatus, jobGroupLimit, statusesForJobGroup } from "../jobs.module";

describe("job operation rules", () => {
  it("allows cancelling only jobs that have not started", () => {
    expect(canCancelJobStatus("WAITING")).toBe(true);
    expect(canCancelJobStatus("DELAYED")).toBe(true);
    expect(canCancelJobStatus("ACTIVE")).toBe(false);
    expect(canCancelJobStatus("COMPLETED")).toBe(false);
    expect(canCancelJobStatus("FAILED")).toBe(false);
  });

  it("keeps operations job groups independently bounded", () => {
    expect(statusesForJobGroup("active")).toEqual(["ACTIVE"]);
    expect(statusesForJobGroup("failed")).toEqual(["FAILED"]);
    expect(jobGroupLimit("active")).toBe(50);
    expect(jobGroupLimit("failed")).toBe(100);
    expect(jobGroupLimit("completed")).toBe(100);
  });
});
