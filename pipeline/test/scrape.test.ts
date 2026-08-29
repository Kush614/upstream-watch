import { describe, it, expect, afterAll } from "vitest";
import { CachedScraperClient } from "../src/clients/index.ts";
import { ScrapeError } from "../src/errors.ts";
import { scrapeVendor } from "../src/scrape.ts";
import { entryKey } from "../src/lib/state.ts";
import { cleanup, seedState, tempStateFile, STRIPE_FIXTURE, STRIPE_RESTRUCTURED } from "./helpers.ts";
import type { ScraperClient } from "../src/clients/index.ts";

/**
 * End-to-end pipeline behaviour against the committed real Stripe capture.
 * No network (CLAUDE.md §7).
 */

const files: string[] = [];
function freshState(): string {
  const file = tempStateFile();
  files.push(file);
  return file;
}

afterAll(() => cleanup(files));

const live = new CachedScraperClient(STRIPE_FIXTURE);
const restructured = new CachedScraperClient(STRIPE_RESTRUCTURED);

describe("scrapeVendor", () => {
  it("baselines silently on a cold start", async () => {
    const stateFile = freshState();

    const run = await scrapeVendor("stripe", { client: live, stateFile });

    expect(run.firstRun).toBe(true);
    expect(run.valid).toBe(run.extracted);
    expect(run.events).toHaveLength(0);
  });

  it("reports nothing when nothing has changed", async () => {
    const stateFile = freshState();

    await scrapeVendor("stripe", { client: live, stateFile });
    const second = await scrapeVendor("stripe", { client: live, stateFile });

    expect(second.added).toBe(0);
    expect(second.events).toHaveLength(0);
  });

  it("separates a change that touches our code from breaking changes elsewhere", async () => {
    const stateFile = freshState();
    // Seed a returning run that has not yet seen the 2026-08-26 release.
    await seedState(stateFile, { vendor: "stripe", seen: [] });

    const run = await scrapeVendor("stripe", { client: live, stateFile });
    const changes = run.events.filter((e) => e.type === "change");
    const ours = changes.filter((e) => e.type === "change" && e.relevance === "symbol-match");

    expect(ours.length).toBeGreaterThan(0);
    expect(changes.length).toBeGreaterThan(ours.length);

    const first = ours[0];
    if (first?.type !== "change") throw new Error("unreachable");
    expect(first.symbols.some((s) => s.includes("PaymentIntent") || s.includes("payment_intents"))).toBe(true);
    expect(first.files).toEqual(["demo-app/src/payments.ts"]);
  });

  it("sorts our changes ahead of the rest", async () => {
    const stateFile = freshState();
    await seedState(stateFile, { vendor: "stripe", seen: [] });

    const run = await scrapeVendor("stripe", { client: live, stateFile });
    const relevances = run.events.filter((e) => e.type === "change").map((e) => e.type === "change" && e.relevance);

    expect(relevances[0]).toBe("symbol-match");
  });

  it("emits SchemaMismatch — not an error — when the vendor restructures the page", async () => {
    const stateFile = freshState();

    const run = await scrapeVendor("stripe", { client: restructured, stateFile });

    expect(run.events).toHaveLength(1);
    const event = run.events[0];
    if (event?.type !== "SchemaMismatch") throw new Error(`expected SchemaMismatch, got ${event?.type}`);

    expect(event.reason).toMatch(/0 entries/);
    expect(event.stats.extracted).toBe(0);
    expect(event.cachedHtmlPath).toBe(STRIPE_RESTRUCTURED);
  });

  it("does not advance state when extraction is broken", async () => {
    const stateFile = freshState();
    await seedState(stateFile, { vendor: "stripe", seen: ["2026-01-01::old"] });

    await scrapeVendor("stripe", { client: restructured, stateFile });
    // A mismatch must not baseline: the entries we could not read are still unseen.
    const after = await scrapeVendor("stripe", { client: live, stateFile });

    expect(after.added).toBeGreaterThan(0);
  });

  it("reports scrape_failed rather than throwing when the fetch fails", async () => {
    const broken: ScraperClient = {
      async scrape() { throw new ScrapeError("Bright Data scrape failed after 3 attempts"); },
    };

    const run = await scrapeVendor("stripe", { client: broken, stateFile: freshState() });

    expect(run.events).toHaveLength(1);
    expect(run.events[0]?.type).toBe("scrape_failed");
  });

  it("records what it saw so a later run does not repeat it", async () => {
    const stateFile = freshState();
    await seedState(stateFile, { vendor: "stripe", seen: [] });

    const first = await scrapeVendor("stripe", { client: live, stateFile });
    const second = await scrapeVendor("stripe", { client: live, stateFile });

    expect(first.events.length).toBeGreaterThan(0);
    expect(second.events).toHaveLength(0);
  });

  it("leaves state untouched with persist: false", async () => {
    const stateFile = freshState();
    await seedState(stateFile, { vendor: "stripe", seen: [] });

    const first = await scrapeVendor("stripe", { client: live, stateFile, persist: false });
    const second = await scrapeVendor("stripe", { client: live, stateFile, persist: false });

    // Inspecting a run must not consume it — rehearsing a demo means running it twice.
    expect(second.events.length).toBe(first.events.length);
  });
});

describe("entryKey", () => {
  it("is stable across runs", () => {
    expect(entryKey({ date: "2026-08-26", title: "A change" })).toBe("2026-08-26::A change");
  });
});
