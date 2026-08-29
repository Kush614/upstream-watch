import { entryKey, getVendorState, type State } from "./state.ts";
import type { ChangelogEntry } from "../types.ts";

export interface DiffResult {
  /** Entries not present in the last-seen state. */
  added: ChangelogEntry[];
  /** True on the very first run for a vendor, when everything looks "new". */
  firstRun: boolean;
}

/**
 * Diff this scrape against what we last saw.
 *
 * On a first run every entry is unseen. Reporting a four-year backlog as "just changed"
 * would be noise, so the caller uses `firstRun` to baseline silently instead
 * (specs/agent.md §The loop, step 2).
 */
export function diffEntries(entries: ChangelogEntry[], state: State, vendor: string): DiffResult {
  const { seen, lastRun } = getVendorState(state, vendor);
  const seenKeys = new Set(seen);

  return {
    added: entries.filter((entry) => !seenKeys.has(entryKey(entry))),
    firstRun: lastRun === null,
  };
}
