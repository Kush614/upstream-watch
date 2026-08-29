import { describe, it, expect } from "vitest";
import { currentPhase, daysUntil, isPast, mergedDetail, type UiEvent } from "../src/adapter.ts";
import { MockAdapter, TIMELINE } from "../src/adapter.mock.ts";

describe("daysUntil", () => {
  it("counts whole days forward", () => {
    expect(daysUntil("2026-12-11", new Date("2026-12-01T23:00:00Z"))).toBe(10);
  });

  it("floors at zero once the date has passed", () => {
    expect(daysUntil("2026-01-01", new Date("2026-12-01T00:00:00Z"))).toBe(0);
  });
});

describe("isPast", () => {
  it("is true on the shutdown day itself, not just after", () => {
    // The vendor turns it off ON that date; "after" would be a day late.
    expect(isPast("2026-12-11", "2026-12-11")).toBe(true);
    expect(isPast("2026-12-11", "2026-12-10")).toBe(false);
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
  it("fails BEFORE and passes AFTER once the emulated date reaches the shutdown", async () => {
    const a = new MockAdapter();
    a.reset();
    await a.setEmulatedDate("2026-12-11");
    for (let i = 0; i < 4; i++) a.advance();

    const { before, after } = await a.loadLastRun();
    expect(before?.status).toBe(400);
    expect(before?.tests.failed).toBeGreaterThan(0);
    expect(after?.status).toBe(200);
    expect(after?.tests.failed).toBe(0);
  });

  it("shows the old code working before the shutdown date", async () => {
    const a = new MockAdapter();
    a.reset();
    for (let i = 0; i < 4; i++) a.advance();
    await a.setEmulatedDate("2026-10-01");

    // The point of the slider: drag back and the outage has not happened yet.
    expect((await a.loadLastRun()).before?.status).toBe(200);
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
