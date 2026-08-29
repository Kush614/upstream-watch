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

describe("the two bugs that made the UI render nothing against a live session", () => {
  it("unwraps the { event: … } envelope the events endpoint returns", async () => {
    const { unwrapEvents } = await import("../src/adapter.ts");

    // Every item from /sessions/{id}/events wraps the event. Handing the envelope to the
    // mappers produced empty panels while a hand-built fixture looked perfectly fine.
    expect(all.every((e) => "event" in e)).toBe(true);

    const flat = unwrapEvents({ data: all });
    expect(flat.length).toBe(all.length);
    expect(flat.some((e) => typeof e.type === "string" && e.type.length > 0)).toBe(true);
  });

  it("recognises the approval event type this server actually emits", async () => {
    const { unwrapEvents, toApprovals } = await import("../src/adapter.ts");
    const flat = unwrapEvents({ data: all });

    // This server emits tool.response_required, not tool.approval_required — matching only
    // the latter meant no pending merge could ever appear.
    expect(flat.some((e) => e.type === "tool.response_required")).toBe(true);

    // But this capture's response_required events are ordinary tool calls, not gated ones,
    // so none of them is an approval. Treating every response_required as a gate produced
    // phantom "Pending action" cards with no changelog, no diff and no PR.
    expect(toApprovals(flat)).toEqual([]);
  });

  it("builds steps from the real stream", async () => {
    const { unwrapEvents, toSteps } = await import("../src/adapter.ts");

    const steps = toSteps(unwrapEvents({ data: all }));
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.some((s) => s.label.includes("github:"))).toBe(true);
    expect(steps.some((s) => s.kind === "subagent")).toBe(true);
  });

  it("links the Did panel to real pull request numbers, not the repo root", async () => {
    const { unwrapEvents, toDone } = await import("../src/adapter.ts");

    const done = toDone(unwrapEvents({ data: all }));
    expect(done.length).toBeGreaterThan(0);
    // The number only exists in the create_pull_request RESPONSE.
    expect(done.some((d) => d.prNumber > 0)).toBe(true);
    expect(done.every((d) => d.prUrl.includes("github.com"))).toBe(true);
  });

  it("does not mark a PR merged just because some merge happened in the session", async () => {
    const { unwrapEvents, toDone } = await import("../src/adapter.ts");

    const done = toDone(unwrapEvents({ data: all }));
    // No merge_pull_request in this capture, so nothing may claim merged.
    expect(done.every((d) => d.status === "open")).toBe(true);
  });
});

describe("only gated calls are approvals", () => {
  it("ignores a generic tool.response_required for an ordinary call", async () => {
    const { toApprovals } = await import("../src/adapter.ts");

    const events = [
      { type: "model.message", id: "e1", tool_calls: [{ id: "c1", function: { name: "exec", arguments: "{}" } }] },
      { type: "tool.response_required", id: "e2", thread_id: "main", tool_calls: [{ id: "c1", source_event_id: "e1" }] },
    ];

    // `exec` needing a response is not a human gate; treating it as one produced phantom
    // "Pending action" cards with no changelog, no diff and no PR.
    expect(toApprovals(events as never)).toEqual([]);
  });

  it("treats response_required for merge_pull_request as a gate", async () => {
    const { toApprovals } = await import("../src/adapter.ts");

    const args = JSON.stringify({ mcp_server: "github", tool_name: "merge_pull_request", input: { owner: "o", repo: "r", pullNumber: 6 } });
    const events = [
      { type: "model.message", id: "e1", tool_calls: [{ id: "c1", function: { name: "call_tool", arguments: args } }] },
      { type: "tool.response_required", id: "e2", thread_id: "main", tool_calls: [{ id: "c1", source_event_id: "e1" }] },
    ];

    const pending = toApprovals(events as never);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.prNumber).toBe(6);
  });
});
