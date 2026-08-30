import { describe, it, expect } from "vitest";
import { currentPhase, daysAgo, mergedDetail, type UiEvent } from "../src/adapter.ts";
import { MockAdapter, TIMELINE } from "../src/adapter.mock.ts";

describe("daysAgo", () => {
  it("counts whole days since the shutdown", () => {
    expect(daysAgo("2026-07-23", new Date("2026-08-29T23:00:00Z"))).toBe(37);
  });

  it("floors at zero rather than counting backwards", () => {
    // A date that has not arrived is not "-14 days ago".
    expect(daysAgo("2026-12-11", new Date("2026-08-29T00:00:00Z"))).toBe(0);
  });
});

describe("mergedDetail", () => {
  it("lets later events refine earlier ones without erasing them", () => {
    const events: UiEvent[] = [
      { phase: "change_found", message: "", at: "", detail: { vendor: "openai", shutdownDate: "2026-12-11" } },
      { phase: "awaiting_approval", message: "", at: "", detail: { diff: "x" } },
    ];

    // The approval event carries no vendor; the card still needs one.
    const d = mergedDetail(events);
    expect(d.vendor).toBe("openai");
    expect(d.shutdownDate).toBe("2026-12-11");
    expect(d.diff).toBe("x");
  });

  it("ignores undefined rather than blanking a known value", () => {
    const events: UiEvent[] = [
      { phase: "change_found", message: "", at: "", detail: { vendor: "openai" } },
      { phase: "testing", message: "", at: "", detail: { vendor: undefined } },
    ];

    expect(mergedDetail(events).vendor).toBe("openai");
  });
});

describe("currentPhase", () => {
  it("is idle with nothing to report", () => {
    expect(currentPhase([])).toBe("idle");
  });
});

describe("the scripted timeline", () => {
  it("tells the whole story in order", () => {
    expect(TIMELINE.map((e) => e.phase)).toEqual([
      "idle", "watching", "change_found", "testing",
      "awaiting_approval", "merged", "repairing", "repaired",
    ]);
  });

  it("says nothing technical in the messages the screen shows by default", () => {
    // No jargon in the default view: the words below belong behind expandable panels.
    const banned = /\b(API|MCP|sandbox|schema|PR|pull request|subagent)\b/;
    for (const e of TIMELINE) expect(e.message).not.toMatch(banned);
  });

  it("carries a real changelog URL, not a placeholder", () => {
    const found = TIMELINE.find((e) => e.detail?.changelog?.url);
    expect(found?.detail?.changelog?.url).toContain("platform.openai.com");
  });

  it("only offers an approval while one is actually pending", () => {
    for (const e of TIMELINE) {
      if (e.detail?.approvalId) expect(e.phase).toBe("awaiting_approval");
    }
  });
});

describe("MockAdapter", () => {
  it("fails BEFORE and passes AFTER, because the shutdown already happened", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 4; i++) a.advance();

    const { before, after } = await a.loadLastRun();
    expect(before?.status).toBe(404);
    expect(before?.tests.failed).toBeGreaterThan(0);
    expect(after?.status).toBe(200);
    expect(after?.tests.failed).toBe(0);
  });

  it("has no date to emulate — the old model is gone whenever you look", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 4; i++) a.advance();

    // There is no slider to drag back to a working past: gpt-5.1-codex-mini was shut down
    // on 2026-07-23 and api.openai.com has returned 404 for it ever since.
    expect((await a.loadLastRun()).before?.status).toBe(404);
  });

  it("streams request then response then tests", async () => {
    const a = new MockAdapter();
    const phases: string[] = [];
    for await (const chunk of await a.run("after")) phases.push(chunk.phase);

    expect(phases).toEqual(["request", "response", "tests"]);
  });

  it("jumps to merged on approve", async () => {
    const a = new MockAdapter();
    a.reset();
    let phase = "";
    a.subscribe((e) => { phase = e.phase; });
    await a.approve("mock-approval-1");

    expect(phase).toBe("merged");
  });
});

describe("regressions the review caught", () => {
  it("does not call a session merged when the newest change is still open", async () => {
    // "Any merged item" announced success while linking an older merge, with a later
    // change still awaiting a human.
    const { toUiEventForTest } = await import("../src/adapter.real.ts");
    const state = {
      connected: true, source: "trueforge" as const, vendors: [], steps: [], pending: [],
      done: [
        { id: "a", vendor: "openai", title: "old", prUrl: "u", prNumber: 5, branch: "", status: "merged" as const, at: "" },
        { id: "b", vendor: "openai", title: "new", prUrl: "u", prNumber: 6, branch: "", status: "open" as const, at: "" },
      ],
      summary: { lastCheck: null, eventsSeen: 0, prsOpened: 2, prsMerged: 1, pendingApprovals: 0 },
    };

    expect(toUiEventForTest(state).phase).not.toBe("merged");
  });

  it("calls it merged when the newest change is the merged one", async () => {
    const { toUiEventForTest } = await import("../src/adapter.real.ts");
    const state = {
      connected: true, source: "trueforge" as const, vendors: [], steps: [], pending: [],
      done: [{ id: "b", vendor: "openai", title: "new", prUrl: "u", prNumber: 6, branch: "", status: "merged" as const, at: "" }],
      summary: { lastCheck: null, eventsSeen: 0, prsOpened: 1, prsMerged: 1, pendingApprovals: 0 },
    };

    expect(toUiEventForTest(state).phase).toBe("merged");
  });
});

describe("Watchlist and citations", () => {
  it("lists every vendor, with Stripe's pin explained rather than hidden", async () => {
    const rows = await new MockAdapter().listVendors();

    expect(rows.map((r) => r.vendor).sort()).toEqual(["cloudflare", "openai", "slack", "stripe"]);

    // A cached vendor sitting silently next to live ones would overstate the coverage.
    const stripe = rows.find((r) => r.vendor === "stripe");
    expect(stripe?.source).toBe("cache");
    expect(stripe?.pinnedBecause).toMatch(/policy_20050/);
  });

  it("cites the vendor's own page, the commit, the reply and the tests", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 4; i++) a.advance();

    const { before } = await a.loadLastRun();
    expect(before?.citations).toHaveLength(4);

    // The chain has to reach OpenAI's page: a claim about a deprecation whose only source
    // is this UI is not evidence of anything.
    expect(before?.citations.some((c) => c.url?.includes("platform.openai.com"))).toBe(true);
    expect(before?.citations.every((c) => c.claim && c.evidence && c.source)).toBe(true);
  });

  it("refuses to answer in the agent's voice when there is no agent", async () => {
    // The offline mock must not invent a reply — that is the one thing this UI cannot do.
    const answer = await new MockAdapter().ask("why did you change this?");
    expect(answer).toMatch(/not running|cannot ask/i);
  });
});
