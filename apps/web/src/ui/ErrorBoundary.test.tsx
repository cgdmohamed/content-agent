import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../report-client-error", () => ({ reportClientError: vi.fn() }));

import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("renders children while nothing has failed", () => {
    const html = renderToString(
      <ErrorBoundary>
        <p>محتوى سليم</p>
      </ErrorBoundary>
    );
    expect(html).toContain("محتوى سليم");
  });

  it("captures a render error and shows the fallback", () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error("boom"))).toEqual({ error: expect.any(Error) });
  });

  it("clears a previous error when the reset key (route) changes", () => {
    const state = { error: new Error("boom"), resetKey: "/content" };
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: "/content" }, state)).toBeNull();
    expect(ErrorBoundary.getDerivedStateFromProps({ children: null, resetKey: "/sites" }, state)).toEqual({ error: null, resetKey: "/sites" });
  });
});
