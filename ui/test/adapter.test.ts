import { describe, it, expect } from "vitest";
import { fencedBlock, filesFrom, parseEvidence, testResultFrom } from "../src/adapter.ts";

/**
 * A PR body in the shape agent/prompts/pr-body.md produces. The approval card recovers its
 * evidence from this, because `merge_pull_request` carries none of it.
 */
const BODY = `## Upstream change detected — stripe

**Changelog entry** (2026-08-26): Removes support for specifying payment method types
> **Removes support for specifying payment method types in Payment Intents**
>
> Removes \`payment_method_types\` as a writable parameter. Affected: PaymentIntent#create
Source: https://docs.stripe.com/changelog/dahlia#removes-payment-method-types

**Why this matters:** Charges API migration.

**Files changed:** \`demo-app/src/payments.ts\`

**Tests:**
\`\`\`
Test Files 1 passed (1)
     Tests 14 passed (14)
\`\`\`

---

Scraped live via Bright Data · vendor-flagged breaking · symbols: \`PaymentIntent#create\`
`;

describe("testResultFrom", () => {
  it("reads a definite pass", () => {
    expect(testResultFrom(BODY)).toBe(true);
  });

  it("reads a definite failure", () => {
    expect(testResultFrom("⚠️ **Tests did not pass** after 3 iterations")).toBe(false);
  });

  it("returns null when nothing says either way", () => {
    // The dangerous case. Defaulting to true would tell a human tests passed when the PR
    // body never said so — and they are about to merge on the strength of that badge.
    expect(testResultFrom("## Upstream change detected — stripe")).toBeNull();
  });

  it("never reports a pass from an empty body", () => {
    expect(testResultFrom("")).not.toBe(true);
  });
});

describe("parseEvidence", () => {
  const entry = parseEvidence(BODY, "fallback");

  it("recovers the vendor, date and source link", () => {
    expect(entry.vendor).toBe("stripe");
    expect(entry.date).toBe("2026-08-26");
    expect(entry.url).toContain("docs.stripe.com/changelog");
  });

  it("recovers the changelog title and quoted excerpt", () => {
    expect(entry.title).toContain("payment method types");
    expect(entry.body).toContain("payment_method_types");
  });

  it("recovers the breaking flag and matched symbols", () => {
    expect(entry.breaking).toBe(true);
    expect(entry.symbols).toContain("PaymentIntent#create");
  });

  it("falls back to the tool name when the body has no evidence", () => {
    const bare = parseEvidence("", "merge_pull_request");

    expect(bare.title).toBe("merge_pull_request");
    expect(bare.vendor).toBe("unknown");
    expect(bare.breaking).toBe(false);
  });
});

describe("filesFrom / fencedBlock", () => {
  it("recovers the files the patch touched", () => {
    expect(filesFrom(BODY)).toEqual(["demo-app/src/payments.ts"]);
  });

  it("recovers the test output block", () => {
    expect(fencedBlock(BODY, "")).toContain("14 passed");
  });

  it("returns empty rather than throwing when a block is absent", () => {
    expect(fencedBlock("no blocks here", "diff")).toBe("");
    expect(filesFrom("")).toEqual([]);
  });
});
