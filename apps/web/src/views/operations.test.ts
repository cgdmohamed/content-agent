import { describe, expect, it } from "vitest";
import { defaultJobTab } from "./Operations";

const empty = { active: [], waiting: [], delayed: [], failed: [], completed: [], cancelled: [] };
const job = { id: "1", contentItemId: null, operation: "WRITE_DRAFT", queueName: "q", attempt: 1, status: "X" };

describe("operations default tab", () => {
  it("opens on what needs attention first", () => {
    expect(defaultJobTab({ ...empty, failed: [job], active: [job] })).toBe("failed");
    expect(defaultJobTab({ ...empty, active: [job], waiting: [job] })).toBe("active");
    expect(defaultJobTab({ ...empty, waiting: [job] })).toBe("waiting");
    expect(defaultJobTab({ ...empty, delayed: [job] })).toBe("delayed");
    expect(defaultJobTab({ ...empty, completed: [job] })).toBe("completed");
    expect(defaultJobTab(empty)).toBe("completed");
  });
});
