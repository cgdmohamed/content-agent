import { describe, expect, it } from "vitest";
import { fieldLimits, formBodyLimit, jsonBodyLimit } from "../payload-limits.js";

describe("payload limits", () => {
  it("uses explicit global body parser limits", () => {
    expect(jsonBodyLimit).toBe("2mb");
    expect(formBodyLimit).toBe("128kb");
  });

  it("keeps expensive user-controlled fields bounded", () => {
    expect(fieldLimits.draftHtml).toBeLessThanOrEqual(1_000_000);
    expect(fieldLimits.gscServiceAccountJson).toBeLessThanOrEqual(20_000);
    expect(fieldLimits.bulkTopics).toBeLessThanOrEqual(20_000);
    expect(fieldLimits.tags).toBeLessThanOrEqual(20);
  });

  it("keeps site language fixed to the Arabic dashboard scope", () => {
    expect(fieldLimits.language).toBe(2);
  });
});
