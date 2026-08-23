import { describe, expect, it } from "vitest";
import { assertSiteActive, isSiteActive, publicAuditFields, safeGscPropertyInput, safeGscServiceAccountInput, safeWordPressInputUrl, sitesListLimit } from "../sites.module.js";

describe("audit metadata field filtering", () => {
  it("does not expose password or JSON secret field names for site updates", () => {
    expect(
      publicAuditFields({
        name: "Site",
        wordpressApplicationPassword: "secret",
        gscServiceAccountJson: "{}",
        gscProperty: "sc-domain:example.com",
        status: "DISABLED"
      })
    ).toEqual(["name", "gscProperty", "status"]);
  });

  it("blocks integration actions for disabled sites", () => {
    expect(isSiteActive("ACTIVE")).toBe(true);
    expect(isSiteActive("DISABLED")).toBe(false);
    expect(isSiteActive("DELETED")).toBe(false);
    expect(() => assertSiteActive("DISABLED")).toThrow("لا يمكن تنفيذ هذا الإجراء على موقع معطل.");
  });

  it("keeps the frequently refreshed sites list bounded", () => {
    expect(sitesListLimit).toBe(200);
  });

  it("accepts only safe WordPress base URLs for storage", () => {
    expect(safeWordPressInputUrl("https://example.com/blog")).toBe("https://example.com");
    expect(() => safeWordPressInputUrl("https://localhost")).toThrow("روابط محلية");
    expect(() => safeWordPressInputUrl("https://192.168.1.20")).toThrow("IP داخلية");
    expect(() => safeWordPressInputUrl("https://user:pass@example.com")).toThrow("بيانات دخول");
  });

  it("validates GSC property and service account input before storage", () => {
    expect(safeGscPropertyInput("SC-DOMAIN:Example.com")).toBe("sc-domain:example.com");
    expect(safeGscPropertyInput("https://example.com/path")).toBe("https://example.com/");
    expect(() => safeGscPropertyInput("not a property")).toThrow("خاصية بحث جوجل");

    const normalized = JSON.parse(
      safeGscServiceAccountInput(
        JSON.stringify({
          client_email: "content-agent@example-project.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
          token_uri: "https://oauth2.googleapis.com/token"
        })
      )
    ) as { client_email: string; token_uri: string };
    expect(normalized.client_email).toBe("content-agent@example-project.iam.gserviceaccount.com");
    expect(normalized.token_uri).toBe("https://oauth2.googleapis.com/token");
    expect(() => safeGscServiceAccountInput("{bad")).toThrow("JSON");
    expect(() =>
      safeGscServiceAccountInput(
        JSON.stringify({
          client_email: "content-agent@example-project.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
          token_uri: "https://evil.example/token"
        })
      )
    ).toThrow("Google OAuth");
  });
});
