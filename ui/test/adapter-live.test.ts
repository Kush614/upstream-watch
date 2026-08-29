import { describe, it, expect } from "vitest";
import { readPrBody, splitDiff } from "../src/adapter.ts";
import events from "./fixtures/session-events.json" with { type: "json" };

/**
 * These run against a REAL captured TrueForge event stream, not a hand-written one.
 * Three assumptions in the first version of the adapter were wrong, and only real data
 * showed it:
 *
 *   1. sessions come back newest-FIRST, so at(-1) is the oldest
 *   2. MCP tools go through a `call_tool` wrapper, so `create_pull_request` never
 *      appears as a tool name
 *   3. an approval's tool_calls carry only {id, source_event_id} — the arguments live
 *      in the event that id points back at
 */

type Ev = { event: { type?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>; state?: { output?: { content?: string } } } };
const all = (events as { data: Ev[] }).data;

function mcpCalls() {
  return all
    .flatMap((e) => e.event.tool_calls ?? [])
    .filter((c) => c.function?.name === "call_tool")
    .map((c) => JSON.parse(c.function?.arguments ?? "{}") as { mcp_server?: string; tool_name?: string; input?: Record<string, unknown> });
}

describe("real event stream", () => {
  it("invokes MCP tools through the call_tool wrapper, never by bare name", () => {
    const bare = all.flatMap((e) => e.event.tool_calls ?? [])
      .some((c) => c.function?.name === "create_pull_request");

    expect(bare).toBe(false);
    expect(mcpCalls().some((c) => c.tool_name === "create_pull_request")).toBe(true);
  });

  it("carries a create_pull_request whose input has owner/repo/head/base/body", () => {
    const pr = mcpCalls().find((c) => c.tool_name === "create_pull_request");

    expect(pr?.mcp_server).toBe("github");
    for (const key of ["owner", "repo", "title", "head", "base", "body"]) {
      expect(pr?.input?.[key]).toBeTruthy();
    }
  });

  it("recovers the changelog evidence the PR body states", () => {
    const pr = mcpCalls().find((c) => c.tool_name === "create_pull_request");
    const parsed = readPrBody(String(pr?.input?.body ?? ""));

    expect(parsed.vendor).toBe("openai");
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.url).toContain("platform.openai.com/docs/deprecations");
    expect(parsed.files.length).toBeGreaterThan(0);
    expect(parsed.excerpt.length).toBeGreaterThan(0);
  });

  it("finds the patcher's diff in its finished thread", () => {
    const results = all
      .filter((e) => e.event.type === "thread.done")
      .map((e) => { try { return JSON.parse(e.event.state?.output?.content ?? ""); } catch { return null; } })
      .filter((r): r is { diff: string; passed: boolean } => Boolean(r?.diff));

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.diff).toContain("diff --git");
  });

  it("splits that real diff into before and after", () => {
    const result = all
      .filter((e) => e.event.type === "thread.done")
      .map((e) => { try { return JSON.parse(e.event.state?.output?.content ?? ""); } catch { return null; } })
      .find((r): r is { diff: string } => Boolean(r?.diff));

    const { before, after } = splitDiff(result!.diff);

    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(before.join("\n")).not.toEqual(after.join("\n"));
  });
});
