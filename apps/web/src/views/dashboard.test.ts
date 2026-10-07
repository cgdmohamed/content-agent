import { describe, expect, it } from "vitest";
import { groupPipeline } from "./Dashboard";

describe("dashboard pipeline stages", () => {
  it("groups the thirteen workflow states into five stages without losing any item", () => {
    const stages = groupPipeline([
      { name: "NEW", value: 2 },
      { name: "IDEAS_READY", value: 1 },
      { name: "DRAFTED", value: 3 },
      { name: "IMAGE_READY", value: 1 },
      { name: "APPROVED", value: 1 },
      { name: "SCHEDULED", value: 2 },
      { name: "PUBLISHED", value: 5 },
      { name: "FAILED", value: 1 },
      { name: "DUPLICATE", value: 1 }
    ]);
    expect(stages.map((stage) => [stage.id, stage.value])).toEqual([["prep", 3], ["draft", 4], ["ready", 3], ["published", 5], ["problem", 2]]);
    expect(stages.reduce((sum, stage) => sum + stage.value, 0)).toBe(17);
  });
});
