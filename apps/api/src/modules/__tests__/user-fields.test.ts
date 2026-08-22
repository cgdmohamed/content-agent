import { describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import { insertUserOrThrowConflict, isUniqueViolation, publicUserUpdateFields, usersListLimit } from "../users.module.js";

describe("user audit field filtering", () => {
  it("does not expose password update field names in audit metadata", () => {
    expect(publicUserUpdateFields({ name: "محرر", password: "new-password", role: "EDITOR", status: "ACTIVE" })).toEqual([
      "name",
      "role",
      "status"
    ]);
  });

  it("keeps the admin users list bounded", () => {
    expect(usersListLimit).toBe(200);
  });

  it("maps database unique violations to a user-facing conflict", async () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "40001" })).toBe(false);

    await expect(insertUserOrThrowConflict(async () => Promise.reject({ code: "23505" }))).rejects.toBeInstanceOf(ConflictException);
    await expect(insertUserOrThrowConflict(async () => Promise.reject(new Error("database down")))).rejects.toThrow("database down");
  });
});
