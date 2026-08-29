import { describe, it, expect, vi } from "vitest";
import { requireApproval, withApproval, GATED_ACTIONS } from "../src/lib/approval.ts";
import { ApprovalRequiredError } from "../src/errors.ts";

/**
 * The approval gate is the thesis of the project (CLAUDE.md §2.3). These tests exist to
 * make it impossible to weaken by accident.
 */
describe("withApproval", () => {
  it("does not perform the action by default", async () => {
    const perform = vi.fn();

    const result = await withApproval("merge-pr", "Merge PR #12", {}, perform);

    expect(perform).not.toHaveBeenCalled();
    expect(result.performed).toBe(false);
  });

  it("performs the action only with an explicit true", async () => {
    const perform = vi.fn().mockResolvedValue("merged");

    const result = await withApproval("merge-pr", "Merge PR #12", { approved: true }, perform);

    expect(perform).toHaveBeenCalledOnce();
    expect(result.performed && result.result).toBe("merged");
  });

  it.each([
    ["undefined", undefined],
    ["false", false],
    ["the string 'true'", "true"],
    ["1", 1],
  ])("treats %s as not approved", async (_label, value) => {
    const perform = vi.fn();

    await withApproval("merge-pr", "d", { approved: value as boolean | undefined }, perform);

    expect(perform).not.toHaveBeenCalled();
  });
});

describe("requireApproval", () => {
  it("throws without approval", () => {
    expect(() => requireApproval("push-to-main", {})).toThrow(ApprovalRequiredError);
  });

  it("passes with approval", () => {
    expect(() => requireApproval("push-to-main", { approved: true })).not.toThrow();
  });
});

describe("gated actions", () => {
  it("covers every irreversible action named in specs/agent.md", () => {
    expect(GATED_ACTIONS).toContain("merge-pr");
    expect(GATED_ACTIONS).toContain("push-to-main");
  });
});
