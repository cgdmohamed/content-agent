import { describe, expect, it } from "vitest";
import { migrationAdvisoryLockKey } from "../database.module";

describe("database migrations", () => {
  it("uses a stable advisory lock key for startup migrations", () => {
    expect(migrationAdvisoryLockKey).toEqual([20260822, 1137]);
    expect(migrationAdvisoryLockKey.every((part) => Number.isInteger(part) && part > 0)).toBe(true);
  });
});
