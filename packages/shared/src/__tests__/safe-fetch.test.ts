import { describe, expect, it, vi } from "vitest";
import { safeFetch } from "../safe-fetch.js";
import { isBlockedIpAddress } from "../url-safety.js";

const publicResolve = async () => ["93.184.216.34"];

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("isBlockedIpAddress", () => {
  it("blocks IPv4-mapped IPv6 and reserved ranges", () => {
    expect(isBlockedIpAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:808:808")).toBe(false);
    expect(isBlockedIpAddress("fe90::1")).toBe(true);
    expect(isBlockedIpAddress("ff02::1")).toBe(true);
    expect(isBlockedIpAddress("198.18.0.1")).toBe(true);
    expect(isBlockedIpAddress("224.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("safeFetch", () => {
  it("rejects hostnames that resolve to internal addresses", async () => {
    const fetchImpl = vi.fn();
    await expect(
      safeFetch("https://evil.example.com/wp-json", {}, { allowHttp: false, resolveHost: async () => ["169.254.169.254"], fetchImpl })
    ).rejects.toThrow("داخلي");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address is internal", async () => {
    await expect(
      safeFetch("https://mixed.example.com", {}, { allowHttp: false, resolveHost: async () => ["93.184.216.34", "127.0.0.1"], fetchImpl: vi.fn() })
    ).rejects.toThrow();
  });

  it("re-validates redirect targets and refuses internal ones", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect("http://127.0.0.1:8080/admin"));
    await expect(safeFetch("https://example.com/a", {}, { allowHttp: false, resolveHost: publicResolve, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("drops credentials on cross-origin redirects and follows manually", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect("https://other.example.org/b"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const response = await safeFetch(
      "https://example.com/a",
      { headers: { Authorization: "Basic abc", Accept: "application/json" } },
      { allowHttp: false, resolveHost: publicResolve, fetchImpl }
    );
    expect(response.status).toBe(200);
    const secondHeaders = fetchImpl.mock.calls[1]![1].headers as Headers;
    expect(secondHeaders.get("authorization")).toBeNull();
    expect(secondHeaders.get("accept")).toBe("application/json");
    expect(fetchImpl.mock.calls[0]![1].redirect).toBe("manual");
  });

  it("keeps credentials on same-origin redirects and caps the redirect chain", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => redirect("https://example.com/loop"));
    await expect(
      safeFetch("https://example.com/a", { headers: { Authorization: "Basic abc" } }, { allowHttp: false, resolveHost: publicResolve, fetchImpl, maxRedirects: 2 })
    ).rejects.toThrow("إعادة التوجيه");
    expect((fetchImpl.mock.calls[1]![1].headers as Headers).get("authorization")).toBe("Basic abc");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
