import { describe, it, expect } from "vitest";
import { classify } from "../src/lib/classify.ts";
import { detectMismatch } from "../src/lib/mismatch.ts";
import { diffEntries } from "../src/lib/diff.ts";
import { entryKey, withSeen } from "../src/lib/state.ts";
import type { ChangelogEntry } from "../src/types.ts";
import type { ValidationResult } from "../src/lib/validate.ts";

const HINTS = ["deprecat", "removed", "breaking", "no longer"];
const SYMBOLS = ["charges.create", "payment_intents", "PaymentIntent#create"];

function entry(over: Partial<ChangelogEntry> = {}): ChangelogEntry {
  return {
    vendor: "stripe", date: "2026-08-26", title: "t", body: "b",
    url: "https://docs.stripe.com/changelog/dahlia#x", breaking: false, ...over,
  };
}

describe("classify", () => {
  it("trusts the vendor's own breaking flag", () => {
    const result = classify(entry({ breaking: true, title: "Adds a field" }), HINTS, SYMBOLS);

    expect(result.breaking).toBe(true);
    expect(result.reasons).toContain("vendor-flagged");
  });

  it("falls back to breaking_hint substrings when the vendor publishes no flag", () => {
    const result = classify(entry({ title: "The source parameter is deprecated" }), HINTS, SYMBOLS);

    expect(result.breaking).toBe(true);
    expect(result.reasons).toContain("hint:deprecat");
  });

  it("leaves an additive change alone", () => {
    expect(classify(entry({ title: "Adds an optional field" }), HINTS, SYMBOLS).breaking).toBe(false);
  });

  it("reports watched symbols separately from breakingness", () => {
    const result = classify(
      entry({ title: "Removes payment_method_types", body: "Affected: PaymentIntent#create" }),
      HINTS, SYMBOLS,
    );

    expect(result.symbols).toContain("PaymentIntent#create");
  });

  it("matches symbols case-insensitively", () => {
    expect(classify(entry({ body: "affects paymentintent#create" }), HINTS, SYMBOLS).symbols)
      .toContain("PaymentIntent#create");
  });

  it("reports no symbols for a change elsewhere in the vendor's API", () => {
    expect(classify(entry({ breaking: true, title: "Updates payout methods" }), HINTS, SYMBOLS).symbols)
      .toEqual([]);
  });
});

describe("detectMismatch", () => {
  const ok = (n: number): ChangelogEntry[] => Array.from({ length: n }, () => entry());
  const validation = (valid: number, invalid: number): ValidationResult => ({
    valid: ok(valid),
    invalid: Array.from({ length: invalid }, () => ({ entry: {}, errors: "/date must match pattern" })),
  });

  it("flags zero entries", () => {
    const verdict = detectMismatch([], validation(0, 0));

    expect(verdict.mismatch).toBe(true);
    expect(verdict.reason).toMatch(/0 entries/);
  });

  it("flags 30% or more failing schema", () => {
    expect(detectMismatch(ok(10), validation(7, 3)).mismatch).toBe(true);
  });

  it("tolerates a small proportion of bad entries", () => {
    const verdict = detectMismatch(ok(10), validation(9, 1));

    expect(verdict.mismatch).toBe(false);
    expect(verdict.stats.invalidRatio).toBe(0.1);
  });

  it("flags a required field empty in more than half the entries", () => {
    const entries = [...ok(2), ...Array.from({ length: 3 }, () => entry({ url: "" }))];

    const verdict = detectMismatch(entries, validation(5, 0));

    expect(verdict.mismatch).toBe(true);
    expect(verdict.stats.emptyFields).toContain("url");
  });
});

describe("diff", () => {
  it("reports entries not seen last run", () => {
    const state = { vendor: "stripe", lastCheck: "2026-08-01T00:00:00Z", seen: [entryKey(entry({ title: "old" }))] };

    const { added, firstRun } = diffEntries([entry({ title: "old" }), entry({ title: "new" })], state);

    expect(firstRun).toBe(false);
    expect(added.map((e) => e.title)).toEqual(["new"]);
  });

  it("marks a cold start so the caller can baseline silently", () => {
    // Stripe alone ships 880 entries; reporting the backlog as news would be useless.
    expect(diffEntries([entry()], { vendor: "stripe", lastCheck: null, seen: [] }).firstRun).toBe(true);
  });

  it("keys entries by date and title", () => {
    const state = withSeen({ vendor: "stripe", lastCheck: null, seen: [] }, [entry({ title: "a" })]);

    expect(state.seen).toEqual(["2026-08-26::a"]);
    expect(state.lastCheck).not.toBeNull();
  });
});
