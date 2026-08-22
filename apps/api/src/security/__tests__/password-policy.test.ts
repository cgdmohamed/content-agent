import { describe, expect, it } from "vitest";
import { passwordPolicyIssues } from "../password-policy.js";

describe("password policy", () => {
  it("requires production-strength passwords", () => {
    expect(passwordPolicyIssues("short1!").length).toBeGreaterThan(0);
    expect(passwordPolicyIssues("long-password-without-number!")).toContain("أن تحتوي على رقم واحد على الأقل");
    expect(passwordPolicyIssues("Strong-Password-2026!")).toEqual([]);
  });
});
