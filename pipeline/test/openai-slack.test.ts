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

describe("the relevance split that --relevant reports", () => {
  it("separates the two events that touch our code from the ~84 that do not", async () => {
    const { scrapeVendor } = await import("../src/scrape.ts");
    const { CachedScraperClient } = await import("../src/clients/index.ts");
    const { tempStateFile, seedState, cleanup } = await import("./helpers.ts");

    const stateFile = tempStateFile();
    // A returning run that has not yet seen the newer deprecations.
    await seedState(stateFile, { vendor: "openai", seen: [] });

    const run = await scrapeVendor("openai", {
      client: new CachedScraperClient("agent/fixtures/html/openai/current.html"),
      stateFile,
      persist: false,
    });

    const ours = run.events.filter((e) => e.type === "change" && e.relevance === "symbol-match");
    const other = run.events.filter((e) => e.type === "change" && e.relevance === "breaking-only");

    // This ratio is the whole reason --relevant exists: handing a watcher subagent all of
    // these verbatim is 40 kB of JSON to say that two of them matter.
    expect(ours.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(ours.length * 10);
    expect(ours.some((e) => e.type === "change" && e.symbols.includes("gpt-5-mini-2025-08-07"))).toBe(true);

    await cleanup([stateFile]);
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

describe("only a deprecations table publishes a deadline", () => {
  it("gives OpenAI's rows a shutdown date, because that column is one", async () => {
    const entries = extractEntries(await capture("openai"), await loadSpec("openai"));

    // Their table is "<shutdown date> | <deprecated> | <replacement>", declared as
    // date_is_shutdown in SKILL.md.
    expect(entries.every((e) => e.shutdown === e.date)).toBe(true);
  });

  it("gives a changelog's entries no deadline at all", async () => {
    const entries = extractEntries(await capture("slack"), await loadSpec("slack"));

    // Slack publishes a changelog. Its dates say when something was written, and copying
    // them into `shutdown` would tell every reader their service broke that day.
    expect(entries.some((e) => e.shutdown !== undefined)).toBe(false);
  });
});
