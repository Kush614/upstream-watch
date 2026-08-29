import { entryKey, type VendorState } from "./state.ts";
import type { ChangelogEntry } from "../types.ts";

export interface DiffResult {
  added: ChangelogEntry[];
  /** True on the first run for a vendor, when everything looks new. */
  firstRun: boolean;
}

/**
 * Diff this scrape against the last run (specs/scraper-pipeline.md §3).
 *
 * On a first run every entry is unseen — Stripe alone ships 880. Reporting a multi-year
 * backlog as "just changed" would be noise, so the caller baselines silently instead.
 */
export function diffEntries(entries: ChangelogEntry[], state: VendorState): DiffResult {
  const seen = new Set(state.seen);

  return {
    added: entries.filter((entry) => !seen.has(entryKey(entry))),
    firstRun: state.lastCheck === null,
  };
}
