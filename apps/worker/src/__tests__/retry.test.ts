import { describe, expect, it } from "vitest";
import { hasRetriesLeft } from "../retry.js";

describe("hasRetriesLeft", () => {
  it("is true until the last configured attempt", () => {
    expect(hasRetriesLeft(0, 3)).toBe(true);
    expect(hasRetriesLeft(1, 3)).toBe(true);
    expect(hasRetriesLeft(2, 3)).toBe(false);
  });

  it("treats jobs without an attempts option as single-attempt", () => {
    expect(hasRetriesLeft(0, undefined)).toBe(false);
    expect(hasRetriesLeft(0, 1)).toBe(false);
  });
});
