import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { extractEntries } from "../src/lib/parse.ts";
import { loadExtractionSpec } from "../src/lib/extraction-spec.ts";
import { validateEntries } from "../src/lib/validate.ts";
import { proposeExtractionSpec } from "../src/lib/repair.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";

const SPEC = "pipeline/extraction-specs/stripe.json";

async function fixture(name: string): Promise<string> {
  return readFile(fromRepoRoot(`agent/fixtures/html/${name}`), "utf8");
}

describe("extractEntries", () => {
  it("pulls every entry off the baseline page", async () => {
    const entries = extractEntries(await fixture("stripe-changelog.html"), await loadExtractionSpec(SPEC));

    expect(entries).toHaveLength(4);
    expect(entries[0]?.date).toBe("2026-08-26");
    expect(entries[0]?.url).toContain("https://docs.stripe.com/changelog/");
  });

  it("preserves code spans as backticked tokens", async () => {
    const entries = extractEntries(await fixture("stripe-changelog-breaking.html"), await loadExtractionSpec(SPEC));

    // This is what lets relevance matching tell `source` from the English word.
    expect(entries[0]?.title).toContain("`source`");
    expect(entries[0]?.body).toContain("`payment_method`");
  });

  it("produces schema-valid entries", async () => {
    const entries = extractEntries(await fixture("stripe-changelog.html"), await loadExtractionSpec(SPEC));
    const { valid, invalid } = validateEntries(entries);

    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(4);
  });

  it("returns nothing rather than throwing when the page is restructured", async () => {
    const entries = extractEntries(await fixture("stripe-changelog-restructured.html"), await loadExtractionSpec(SPEC));

    expect(entries).toEqual([]);
  });
});

describe("proposeExtractionSpec", () => {
  it("recovers a working spec from the restructured page", async () => {
    const html = await fixture("stripe-changelog-restructured.html");
    const proposal = proposeExtractionSpec(html, await loadExtractionSpec(SPEC));

    expect(proposal).not.toBeNull();
    expect(proposal?.spec.entry).toBe("section.release-note");
    expect(proposal?.validEntries).toBe(4);
    expect(proposal?.spec.version).toBe(2);

    // The recovered spec must extract the same content the old one did.
    const entries = extractEntries(html, proposal!.spec);
    expect(entries).toHaveLength(4);
    expect(entries[0]?.date).toBe("2026-08-26");
    expect(entries[0]?.title).toContain("payout.reconciled");
  });

  it("gives up rather than inventing a spec for a page with no entries", async () => {
    const proposal = proposeExtractionSpec(
      "<html><body><p>Nothing here.</p></body></html>",
      await loadExtractionSpec(SPEC),
    );

    expect(proposal).toBeNull();
  });
});
