import { describe, it, expect } from "vitest";
import { compareRecorded } from "../src/lib/regression.ts";
import { entryKey } from "../src/lib/state.ts";
import type { ChangelogEntry } from "../src/types.ts";

function entry(date: string, title: string): ChangelogEntry {
  return { vendor: "stripe", date, title, body: "", url: "https://x.test/a", breaking: false };
}

/**
 * Qodo caught the previous version of this check being tautological: it built the key set
 * from the candidate's own output and then looked for examples drawn from that same array,
 * so `found` could never differ from `checked`. These tests exist so it cannot come back —
 * the first one fails outright under the old implementation.
 */
describe("compareRecorded", () => {
  const recorded = [entryKey(entry("2026-08-26", "A")), entryKey(entry("2026-08-25", "B"))];

  it("reports entries the candidate can no longer find", () => {
    const result = compareRecorded(recorded, [entry("2026-08-26", "A")]);

    expect(result.checked).toBe(2);
    expect(result.found).toBe(1);
    expect(result.missing).toEqual(["2026-08-25::B"]);
  });

  it("passes when the candidate re-finds everything recorded", () => {
    const result = compareRecorded(recorded, [entry("2026-08-26", "A"), entry("2026-08-25", "B")]);

    expect(result.found).toBe(2);
    expect(result.missing).toEqual([]);
  });

  it("reports everything missing when the candidate reads nothing", () => {
    // The expected case after a genuine redesign: reported, never a hard gate.
    const result = compareRecorded(recorded, []);

    expect(result.found).toBe(0);
    expect(result.missing).toHaveLength(2);
  });

  it("is not satisfied by the candidate's own output alone", () => {
    // The tautology: keys derived from the candidate would make this pass with found=2.
    const candidate = [entry("2026-01-01", "Something else entirely")];

    expect(compareRecorded(recorded, candidate).found).toBe(0);
  });

  it("handles having nothing recorded", () => {
    expect(compareRecorded([], [entry("2026-08-26", "A")])).toEqual({ checked: 0, found: 0, missing: [] });
  });
});
