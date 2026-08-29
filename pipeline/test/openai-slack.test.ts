import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { extractEntries } from "../src/lib/parse.ts";
import { loadSpec } from "../src/lib/spec.ts";
import { validateEntries } from "../src/lib/validate.ts";
import { classify } from "../src/lib/classify.ts";
import { loadTarget } from "../src/lib/targets.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";

const SCHEMA = "schemas/changelog-entry.json";
const capture = (v: string) => readFile(fromRepoRoot(`agent/fixtures/html/${v}/current.html`), "utf8");

/**
 * Two more real vendors, exercising both strategies against captures of their live pages.
 * OpenAI is a table (css); Slack is schema.org JSON-LD (embedded-json).
 */

describe("openai — deprecation tables via css", () => {
  it("extracts every row cleanly", async () => {
    const entries = extractEntries(await capture("openai"), await loadSpec("openai"));
    const { valid, invalid } = await validateEntries(entries, SCHEMA);

    expect(entries.length).toBeGreaterThan(100);
    expect(invalid).toHaveLength(0);
    expect(valid.length).toBe(entries.length);
  });

  it("normalises human dates like 'Jan 20, 2027' to ISO", async () => {
    const entries = extractEntries(await capture("openai"), await loadSpec("openai"));

    for (const e of entries) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the replacement in the body, because the vendor states the migration target", async () => {
    const entries = extractEntries(await capture("openai"), await loadSpec("openai"));
    const row = entries.find((e) => e.title.includes("gpt-5-mini-2025-08-07"));

    // The row is "<date> <deprecated> <replacement>" — so we do not have to infer the fix.
    expect(row).toBeDefined();
    expect(row?.body).toContain("gpt-5.6-terra");
  });

  it("flags the model demo-app is pinned to as breaking and ours", async () => {
    const entries = extractEntries(await capture("openai"), await loadSpec("openai"));
    const target = await loadTarget("openai");
    const spec = await loadSpec("openai");

    const row = entries.find((e) => e.title.includes("gpt-5-mini-2025-08-07"));
    const result = classify(row!, spec.breaking_hint, target.symbols);

    expect(result.breaking).toBe(true);
    expect(result.symbols).toContain("gpt-5-mini-2025-08-07");
    expect(target.files).toEqual(["demo-app/src/risk.ts"]);
  });
});

describe("slack — schema.org JSON-LD via embedded-json", () => {
  it("extracts every blogPost cleanly", async () => {
    const entries = extractEntries(await capture("slack"), await loadSpec("slack"));
    const { valid, invalid } = await validateEntries(entries, SCHEMA);

    expect(entries.length).toBeGreaterThan(100);
    expect(invalid).toHaveLength(0);
    expect(valid.length).toBe(entries.length);
  });

  it("reads an ISO timestamp even though it is followed by a letter", async () => {
    const entries = extractEntries(await capture("slack"), await loadSpec("slack"));

    // datePublished is "2026-08-20T00:00:00.000Z". A trailing \b would fail here, because
    // "0" and "T" are both word characters — the bug this pins.
    for (const e of entries) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries real permalinks", async () => {
    const entries = extractEntries(await capture("slack"), await loadSpec("slack"));

    for (const e of entries.slice(0, 20)) expect(e.url).toMatch(/^https:\/\/docs\.slack\.dev\/changelog\//);
  });

  it("falls back to breaking_hint, since Slack publishes no breaking flag", async () => {
    const entries = extractEntries(await capture("slack"), await loadSpec("slack"));
    const spec = await loadSpec("slack");

    expect(entries.every((e) => e.breaking === false)).toBe(true);
    expect(entries.some((e) => classify(e, spec.breaking_hint, []).breaking)).toBe(true);
  });
});
