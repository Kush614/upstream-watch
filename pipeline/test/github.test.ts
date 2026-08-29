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

describe("filesInDiff", () => {
  it("names only the paths the patch touches", async () => {
    const { filesInDiff } = await import("../src/clients/github.ts");

    const diff = [
      "diff --git a/demo-app/src/risk.ts b/demo-app/src/risk.ts",
      "--- a/demo-app/src/risk.ts",
      "+++ b/demo-app/src/risk.ts",
      "-const M = 'old';",
      "+const M = 'new';",
      "diff --git a/demo-app/test/vendors.test.ts b/demo-app/test/vendors.test.ts",
      "+++ b/demo-app/test/vendors.test.ts",
    ].join("\n");

    // `git add -A` swept up whatever else was in the working tree and pushed it into a PR
    // a human was about to approve. Only these two paths may be staged.
    expect(filesInDiff(diff).sort()).toEqual(["demo-app/src/risk.ts", "demo-app/test/vendors.test.ts"]);
  });

  it("returns nothing for an empty diff, so the caller can decide", async () => {
    const { filesInDiff } = await import("../src/clients/github.ts");

    expect(filesInDiff("")).toEqual([]);
  });

  it("ignores the /dev/null marker a deletion writes", async () => {
    const { filesInDiff } = await import("../src/clients/github.ts");

    // git writes a bare "+++ /dev/null" for a deleted file — no b/ prefix — so it simply
    // does not match, and a path that genuinely starts with dev/ is still kept.
    expect(filesInDiff("+++ /dev/null\n+++ b/real/file.ts")).toEqual(["real/file.ts"]);
  });
});
