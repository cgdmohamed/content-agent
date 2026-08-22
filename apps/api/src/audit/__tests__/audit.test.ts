import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "../audit.module.js";

describe("audit metadata sanitization", () => {
  it("redacts sensitive metadata fields recursively", () => {
    expect(
      sanitizeAuditMetadata({
        operation: "SITE_UPDATED",
        wordpressApplicationPassword: "secret",
        nested: {
          private_key: "-----BEGIN PRIVATE KEY-----",
          token: "oauth-token",
          safe: "يبقى ظاهرًا"
        }
      })
    ).toEqual({
      operation: "SITE_UPDATED",
      wordpressApplicationPassword: "[محجوب]",
      nested: {
        private_key: "[محجوب]",
        token: "[محجوب]",
        safe: "يبقى ظاهرًا"
      }
    });
  });

  it("truncates very long strings and arrays", () => {
    const value = sanitizeAuditMetadata({
      message: "x".repeat(600),
      items: Array.from({ length: 30 }, (_, index) => index)
    }) as { message: string; items: number[] };

    expect(value.message.length).toBeLessThan(510);
    expect(value.message.endsWith("...")).toBe(true);
    expect(value.items).toHaveLength(20);
  });
});
