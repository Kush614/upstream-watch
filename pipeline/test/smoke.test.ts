import { describe, it, expect } from "vitest";

/**
 * Placeholder so the harness is proven wired before H2. Real coverage lands with the
 * pipeline — see specs/scraper-pipeline.md §6 for the minimum set:
 *   seeded-breaking fixture -> exactly one relevant event
 *   clean fixture           -> zero events
 *   broken-structure        -> a repair event, not a crash
 * No network in tests (CLAUDE.md §7).
 */
describe("pipeline", () => {
  it("has a working test harness", () => {
    expect(true).toBe(true);
  });
});
