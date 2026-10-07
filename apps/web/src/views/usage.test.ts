import { describe, expect, it } from "vitest";
import { budgetTone, fillDays, reconcile, usd } from "./Usage";

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

  it("reconciles the app's estimate with a provider invoice, ignoring cent-level rounding", () => {
    expect(reconcile(0.0349, 0.03).status).toBe("match"); // rounding on the invoice
    expect(reconcile(0.83, 0.83).status).toBe("match");
    expect(reconcile(0.9, 0.83).status).toBe("close");
    expect(reconcile(0.45, 0.03).status).toBe("off"); // e.g. cached tokens billed as full-price input
    expect(reconcile(0.45, 0.03).deltaUsd).toBe(0.42);
    expect(reconcile(0, 0).status).toBe("match");
    expect(reconcile(1.2, 0).status).toBe("off");
  });

  it("fills days without spend so the chart shows the whole period", () => {
    const days = fillDays([{ date: "2026-10-02", costUsd: 0.5 }], "2026-10-01", "2026-10-04");
    expect(days).toEqual([
      { date: "2026-10-01", costUsd: 0 },
      { date: "2026-10-02", costUsd: 0.5 },
      { date: "2026-10-03", costUsd: 0 },
      { date: "2026-10-04", costUsd: 0 }
    ]);
  });
});
