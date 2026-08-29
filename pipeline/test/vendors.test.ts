import { describe, it, expect, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { CachedScraperClient, createScraperClient, BrightDataScraperClient } from "../src/clients/index.ts";
import { extractEntries } from "../src/lib/parse.ts";
import { loadSpec } from "../src/lib/spec.ts";
import { loadTarget, loadTargets } from "../src/lib/targets.ts";
import { validateEntries } from "../src/lib/validate.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";
import { scrapeVendor } from "../src/scrape.ts";
import { cleanup, tempStateFile } from "./helpers.ts";

const CF_FIXTURE = "agent/fixtures/html/cloudflare/current.html";
const files: string[] = [];
afterAll(() => cleanup(files));

/**
 * Cloudflare is the `css` strategy's real-world case, and the vendor Bright Data actually
 * permits — docs.stripe.com is compliance-blocked (policy_20050), so Stripe is pinned to
 * its committed capture. Both paths are exercised here.
 */
describe("cloudflare — the css strategy against a real capture", () => {
  it("extracts every entry cleanly", async () => {
    const html = await readFile(fromRepoRoot(CF_FIXTURE), "utf8");
    const entries = extractEntries(html, await loadSpec("cloudflare"));
    const { valid, invalid } = await validateEntries(entries, "schemas/changelog-entry.json");

    expect(entries.length).toBeGreaterThan(10);
    expect(invalid).toHaveLength(0);
    expect(valid.length).toBe(entries.length);
  });

  it("reads the date from the time element's datetime attribute", async () => {
    const html = await readFile(fromRepoRoot(CF_FIXTURE), "utf8");
    const entries = extractEntries(html, await loadSpec("cloudflare"));

    for (const entry of entries) expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves relative permalinks against the changelog URL", async () => {
    const html = await readFile(fromRepoRoot(CF_FIXTURE), "utf8");
    const entries = extractEntries(html, await loadSpec("cloudflare"));

    // hrefs on the page are like "/changelog/post/…" and would fail the schema verbatim.
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/developers\.cloudflare\.com\/changelog\//);
    }
  });

  it("preserves code spans so symbol matching can see them", async () => {
    const html = await readFile(fromRepoRoot(CF_FIXTURE), "utf8");
    const entries = extractEntries(html, await loadSpec("cloudflare"));

    expect(entries.some((e) => e.body.includes("`"))).toBe(true);
  });
});

describe("per-vendor source", () => {
  it("pins stripe to its committed capture", async () => {
    // Bright Data blocks docs.stripe.com, so this is config, not preference.
    expect((await loadTarget("stripe")).source).toBe("cache");
  });

  it("leaves cloudflare live", async () => {
    expect((await loadTarget("cloudflare")).source).toBeUndefined();
  });

  it("selects the cached client for a pinned vendor", () => {
    expect(createScraperClient({ source: "cache" }, {} as NodeJS.ProcessEnv))
      .toBeInstanceOf(CachedScraperClient);
  });

  it("selects the live client otherwise", () => {
    expect(createScraperClient({}, {} as NodeJS.ProcessEnv)).toBeInstanceOf(BrightDataScraperClient);
  });

  it("DEMO_MODE=1 forces cache for every vendor", () => {
    expect(createScraperClient({}, { DEMO_MODE: "1" } as NodeJS.ProcessEnv))
      .toBeInstanceOf(CachedScraperClient);
  });
});

describe("both vendors are configured", () => {
  it("watches four vendors, each mapped to real files", async () => {
    const { vendors } = await loadTargets();

    expect(vendors.map((v) => v.vendor).sort()).toEqual(["cloudflare", "openai", "slack", "stripe"]);
    for (const v of vendors) {
      expect(v.files.length).toBeGreaterThan(0);
      expect(v.symbols.length).toBeGreaterThan(0);
    }
  });

  it("baselines cloudflare silently on a cold start", async () => {
    const stateFile = tempStateFile();
    files.push(stateFile);

    const run = await scrapeVendor("cloudflare", {
      client: new CachedScraperClient(CF_FIXTURE),
      stateFile,
    });

    expect(run.firstRun).toBe(true);
    expect(run.events).toHaveLength(0);
    expect(run.valid).toBeGreaterThan(10);
  });
});
