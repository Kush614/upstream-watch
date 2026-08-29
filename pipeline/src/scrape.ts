import { createScraperClient, type ScraperClient } from "./clients/index.ts";
import { ScrapeError } from "./errors.ts";
import { markLastGood } from "./lib/cache.ts";
import { classify } from "./lib/classify.ts";
import { diffEntries } from "./lib/diff.ts";
import { detectMismatch } from "./lib/mismatch.ts";
import { extractEntries } from "./lib/parse.ts";
import { loadSpec } from "./lib/spec.ts";
import { loadState, saveState, withSeen } from "./lib/state.ts";
import { loadTarget } from "./lib/targets.ts";
import { validateEntries } from "./lib/validate.ts";
import { MAX_ATTEMPTS } from "./clients/brightdata.ts";
import type { ChangeEvent, ChangelogEntry, Provenance } from "./types.ts";

export interface ScrapeOptions {
  client?: ScraperClient;
  /** Skip writing state. Used when inspecting a run without consuming it. */
  persist?: boolean;
  /** Override the state file. Tests use this so they never touch committed state. */
  stateFile?: string;
}

export interface VendorRun {
  vendor: string;
  provenance: Provenance | null;
  cachedHtmlPath: string | null;
  extracted: number;
  valid: number;
  added: number;
  firstRun: boolean;
  events: ChangeEvent[];
}

/**
 * One pass over one vendor: scrape → cache → parse → validate → diff → events.
 * The watcher subagent consumes this as JSON (specs/agent.md §Watcher subagent).
 */
export async function scrapeVendor(vendor: string, options: ScrapeOptions = {}): Promise<VendorRun> {
  const target = await loadTarget(vendor);
  const spec = await loadSpec(vendor);
  const client = options.client ?? createScraperClient(target);

  const empty: VendorRun = {
    vendor, provenance: null, cachedHtmlPath: null,
    extracted: 0, valid: 0, added: 0, firstRun: false, events: [],
  };

  // A page we cannot fetch at all is a failure. A page we can fetch but cannot read is not.
  let scrape;
  try {
    scrape = await client.scrape(target);
  } catch (error) {
    return {
      ...empty,
      events: [{
        type: "scrape_failed",
        vendor,
        reason: error instanceof ScrapeError ? error.message : String(error),
        attempts: MAX_ATTEMPTS,
      }],
    };
  }

  const extracted = extractEntries(scrape.html, spec);
  const validation = await validateEntries(extracted, target.schema);
  const verdict = detectMismatch(extracted, validation);

  const base: VendorRun = {
    ...empty,
    provenance: scrape.provenance,
    cachedHtmlPath: scrape.cachedHtmlPath,
    extracted: extracted.length,
    valid: validation.valid.length,
  };

  // The vendor changed their page, not their API. That is signal, not an error
  // (CLAUDE.md §6, specs/scraper-pipeline.md §3).
  if (verdict.mismatch) {
    return {
      ...base,
      events: [{
        type: "SchemaMismatch",
        vendor,
        reason: verdict.reason,
        cachedHtmlPath: scrape.cachedHtmlPath,
        stats: verdict.stats,
      }],
    };
  }

  // This HTML parsed cleanly, so it becomes the regression baseline for repair.
  await markLastGood(vendor, scrape.html);

  const state = await loadState(vendor, options.stateFile);
  const { added, firstRun } = diffEntries(validation.valid, state);

  if (options.persist !== false) {
    await saveState(withSeen(state, validation.valid), options.stateFile);
  }

  // Everything looks new the first time — Stripe alone ships 880 entries. Baseline
  // silently rather than reporting a multi-year backlog as breaking news.
  if (firstRun) {
    return { ...base, added: added.length, firstRun: true };
  }

  return { ...base, added: added.length, events: toEvents(added, target.symbols, spec.breaking_hint, target.files, vendor) };
}

function toEvents(
  added: ChangelogEntry[],
  symbols: string[],
  hints: string[],
  files: string[],
  vendor: string,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];

  for (const entry of added) {
    const { breaking, symbols: matched } = classify(entry, hints, symbols);

    // The orchestrator keeps events that are breaking OR mention a watched symbol
    // (specs/agent.md §2). Anything else is noise and never reaches it.
    if (!breaking && matched.length === 0) continue;

    events.push({
      type: "change",
      vendor,
      entry,
      breaking,
      symbols: matched,
      files,
      relevance: matched.length > 0 ? "symbol-match" : "breaking-only",
    });
  }
  // Symbol matches first: the orchestrator patches those, and only mentions the rest.
  return events.sort((a, b) => {
    const rank = (e: ChangeEvent) => (e.type === "change" && e.relevance === "symbol-match" ? 0 : 1);
    return rank(a) - rank(b);
  });
}

/** Every vendor in targets.yaml. The orchestrator normally fans these out as subagents. */
export async function scrapeAll(vendors: string[], options: ScrapeOptions = {}): Promise<VendorRun[]> {
  return Promise.all(vendors.map((vendor) => scrapeVendor(vendor, options)));
}
