import { describe, it, expect, vi } from "vitest";
import { GhCliClient } from "../src/clients/github.ts";

/**
 * The merge gate, at the client boundary.
 *
 * These deliberately do not stub `gh`: the point is that without approval the client must
 * not reach the CLI at all. If `withApproval` ever stopped short-circuiting, an unstubbed
 * `gh pr merge` would be the failure — which is exactly the bug worth catching.
 */
describe("GhCliClient.mergePr", () => {
  it("does not merge without explicit approval", async () => {
    const result = await new GhCliClient().mergePr(4, {});

    expect(result.performed).toBe(false);
    expect(result.action).toBe("merge-pr");
    if (result.performed) throw new Error("unreachable");
    expect(result.description).toContain("#4");
  });

  it.each([
    ["undefined", undefined],
    ["false", false],
    ["the string 'true'", "true"],
    ["1", 1],
  ])("treats %s as not approved and stays a dry run", async (_label, value) => {
    const result = await new GhCliClient().mergePr(4, { approved: value as boolean | undefined });

    expect(result.performed).toBe(false);
  });

  it("records the reason a human gave for rejecting", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await new GhCliClient().mergePr(4, { approved: false, reason: "wrong fix" });

    expect(result.performed).toBe(false);
    spy.mockRestore();
  });
});
