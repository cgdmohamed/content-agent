import { describe, expect, it } from "vitest";
import { normalizeRequestId, requestIdMiddleware, type RequestWithId } from "../request-id.js";

describe("request id middleware", () => {
  it("keeps safe incoming request ids", () => {
    expect(normalizeRequestId("client-req_123456")).toBe("client-req_123456");
    expect(normalizeRequestId(["trace:12345678"])).toBe("trace:12345678");
  });

  it("rejects unsafe incoming request ids", () => {
    expect(normalizeRequestId("short")).toBeNull();
    expect(normalizeRequestId("bad id with spaces")).toBeNull();
    expect(normalizeRequestId("<script>alert(1)</script>")).toBeNull();
  });

  it("sets the request id on the request and response", () => {
    const request: RequestWithId = { headers: { "x-request-id": "client-req-123456" } };
    let headerValue = "";
    let nextCalled = false;

    requestIdMiddleware(
      request,
      { setHeader: (_name, value) => (headerValue = value) },
      () => (nextCalled = true)
    );

    expect(request.requestId).toBe("client-req-123456");
    expect(headerValue).toBe("client-req-123456");
    expect(nextCalled).toBe(true);
  });
});
