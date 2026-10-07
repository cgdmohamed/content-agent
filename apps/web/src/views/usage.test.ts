import { describe, expect, it } from "vitest";
import { budgetTone, usd } from "./Usage";

describe("usage formatting", () => {
  it("shows small amounts with millidollar precision so cheap calls are not rounded to zero", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(0.0123)).toBe("$0.012");
    expect(usd(12.3456)).toBe("$12.35");
  });

  it("warns at 80% of the budget and flags the budget or the hard limit being reached", () => {
    expect(budgetTone(10, 30, 40)).toBe("ok");
    expect(budgetTone(24, 30, 40)).toBe("warn");
    expect(budgetTone(30, 30, 40)).toBe("danger");
    expect(budgetTone(5, 0, 0)).toBe("ok");
  });
});
