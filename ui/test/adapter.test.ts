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

describe("what the review caught on the watchlist", () => {
  it("does not offer a conversation the frozen capture cannot have", async () => {
    // Events on screen are not evidence of a live agent: offline they come from a capture.
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 4; i++) a.advance();

    expect((await a.history()).length).toBeGreaterThan(0);
    expect(a.hasLiveSession()).toBe(false);
  });

  it("uses a typed error for a vendor it does not watch", async () => {
    const { WatchlistError } = await import("../src/adapter.ts");
    await expect(new MockAdapter().checkVendor("netflix")).rejects.toBeInstanceOf(WatchlistError);
  });
});

describe("the upstream explorer", () => {
  it("keeps real dependencies apart from reference demonstrations", async () => {
    const { buildTree } = await import("../src/lib/tree.ts");
    const a = new MockAdapter();
    const tree = buildTree(await a.listVendors(), await a.listPackages(), await a.listOssProofs());

    expect(tree.map((n) => n.label)).toEqual(["Hosted APIs", "Your dependencies", "Reference breaks"]);
    // Folding a demonstration in with real dependencies is how it becomes a false claim
    // about your codebase — which is exactly what this file used to do.
    expect(tree[2].badge).toMatch(/not your code/);
    expect(tree[1].badge).toMatch(/read from your manifests/);
  });

  it("gives the same package two ids when it appears in both roles", async () => {
    const { buildTree, findNode } = await import("../src/lib/tree.ts");
    const a = new MockAdapter();
    const tree = buildTree(await a.listVendors(), await a.listPackages(), await a.listOssProofs());

    // express is both a real dependency (current) and a reference break (4 to 5). One id
    // for both silently renders one of them twice.
    expect(findNode(tree, "pkg:dependency:express")?.badge).toBe("current");
    expect(findNode(tree, "pkg:reference:express")?.badge).toBe("silent break");
  });


  it("never says a dependency is fine just because the runner is unreachable", async () => {
    const { realAdapter } = await import("../src/adapter.real.ts");
    // An empty tree reads as "nothing to worry about" — the opposite of what a dead
    // runner actually tells you.
    await expect(realAdapter.listPackages()).rejects.toThrow();
  });
});

describe("the explorer's empty state", () => {
  it("does not let an unreachable runner render as an empty watchlist", async () => {
    // An empty tree reads as "nothing upstream can hurt you" — the most reassuring thing
    // the page could say, and the least likely to be true.
    const { realAdapter } = await import("../src/adapter.real.ts");
    await expect(realAdapter.listVendors()).rejects.toThrow();
  });
});

describe("attaching a proof to the right row", () => {
  it("does not label a current dependency with a reference break's receipt", async () => {
    const { buildTree, findNode } = await import("../src/lib/tree.ts");
    const a = new MockAdapter();
    const tree = buildTree(await a.listVendors(), await a.listPackages(), await a.listOssProofs());

    // express appears twice: the real dependency (5.2.1, current) and the 4→5 reference.
    // Keying a proof by package name alone hands the current row a 404→200 receipt from a
    // comparison it was never part of.
    const dep = findNode(tree, "pkg:dependency:express");
    const ref = findNode(tree, "pkg:reference:express");

    expect(dep?.children?.some((c) => c.id.endsWith(":proof"))).toBe(false);
    expect(ref?.children?.some((c) => c.id.endsWith(":proof"))).toBe(true);
  });
});

describe("a proof must exercise something this repo calls", () => {
  it("does not claim a dependency breaks over a symbol the repo never uses", async () => {
    const { buildTree, findNode } = await import("../src/lib/tree.ts");
    const a = new MockAdapter();
    const tree = buildTree(await a.listVendors(), await a.listPackages(), await a.listOssProofs());

    // The react-dom versions genuinely match this repo's dependency, so a version-only
    // check attaches the proof. But that proof exercises ReactDOM.render and ui/src/main.tsx
    // mounts with createRoot — so it would say "your code breaks" over a call never made.
    const dep = findNode(tree, "pkg:dependency:react-dom");
    expect(dep?.children?.some((c) => c.id.endsWith(":proof"))).toBe(false);
    expect(findNode(tree, "pkg:reference:react-dom")?.children?.some((c) => c.id.endsWith(":proof"))).toBe(true);
  });
});

describe("severity and the timeline", () => {
  it("says a passed shutdown already happened, in the past tense", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 3; i++) a.advance();

    const { detail } = (await a.history()).at(-1)!;
    expect(detail?.severity).toBe("breaks");
    expect(detail?.alreadyPast).toBe(true);
    // A warning about something that already broke is not a warning.
    expect(detail?.because).toMatch(/already happened/);
  });

  it("counts one entry per vendor, not one per event", async () => {
    const { countsLine } = await import("../src/lib/severity.ts");
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 6; i++) a.advance();

    // The same change arrives on every poll as the run progresses; counting each arrival
    // turns one problem into a crowd.
    expect(countsLine(await a.history())).toBe("1 breaking now");
  });

  it("reports the gap as exposure when the fix landed after the shutdown", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 3; i++) a.advance();

    const t = (await a.history()).at(-1)!.detail!.timeline!;
    // merged 2026-08-30, shutdown 2026-07-23 — "38 days early" would be a lie in the
    // most flattering possible direction.
    expect(t.shutdown! < t.merged!).toBe(true);
  });
});
