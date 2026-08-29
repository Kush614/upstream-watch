import { describe, it, expect, vi, afterEach } from "vitest";
import { TrueForgeHttpClient } from "../src/clients/trueforge.ts";
import { TrueForgeError } from "../src/errors.ts";

/**
 * External calls go through a typed client (CLAUDE.md §7). A script talking to the harness
 * directly spread endpoint and transport knowledge outside that boundary.
 */
afterEach(() => vi.unstubAllGlobals());

describe("TrueForgeHttpClient", () => {
  it("rewrites localhost to the loopback the harness actually binds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await new TrueForgeHttpClient("http://localhost:8790").listSessions();

    // TrueForge binds [::1]:8790; "localhost" resolves to 127.0.0.1, where nothing listens.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("[::1]:8790");
  });

  it("returns sessions newest first regardless of server order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { id: "old", title: "o", created_at: "2026-08-01T00:00:00Z" },
        { id: "new", title: "n", created_at: "2026-08-29T00:00:00Z" },
      ] }),
    }));

    const sessions = await new TrueForgeHttpClient().listSessions();
    expect(sessions.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("throws a typed error naming how to start the harness when it is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(new TrueForgeHttpClient().listSessions()).rejects.toThrow(TrueForgeError);
    await expect(new TrueForgeHttpClient().listSessions()).rejects.toThrow(/npx @truefoundry\/trueforge/);
  });

  it("throws a typed error carrying the status when the harness answers with one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" }));

    await expect(new TrueForgeHttpClient().sessionEvents("s1")).rejects.toThrow(/503/);
  });

  it("encodes the session id into the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await new TrueForgeHttpClient().sessionEvents("a/b");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("a%2Fb");
  });
});
