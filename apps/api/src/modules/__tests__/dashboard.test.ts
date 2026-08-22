import { describe, expect, it } from "vitest";
import { dashboardSitesLimit } from "../dashboard.module";

describe("dashboard query limits", () => {
  it("keeps site status cards bounded for fast dashboard refreshes", () => {
    expect(dashboardSitesLimit).toBe(24);
  });
});
