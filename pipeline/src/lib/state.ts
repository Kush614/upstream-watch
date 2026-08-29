import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fromRepoRoot } from "./paths.ts";
import type { ChangelogEntry } from "../types.ts";

/**
 * Last-seen state. A plain JSON file, gitignored.
 *
 * Deliberately not in the harness's SQLite: the pipeline runs as a plain script, and
 * keeping its state local means `pnpm demo:seed` can reset the demo by deleting one file.
 */
const STATE_FILE = ".upstream-watch/state.json";

export interface VendorState {
  seen: string[];
  lastRun: string | null;
}

export type State = Record<string, VendorState>;

/** Stable identity for an entry. The permalink is the vendor's own identifier. */
export function entryKey(entry: Pick<ChangelogEntry, "vendor" | "date" | "url" | "title">): string {
  return entry.url || `${entry.vendor}:${entry.date}:${entry.title}`;
}

export async function loadState(file = STATE_FILE): Promise<State> {
  try {
    return JSON.parse(await readFile(fromRepoRoot(file), "utf8")) as State;
  } catch {
    // No state yet is the normal first-run case, not an error.
    return {};
  }
}

export async function saveState(state: State, file = STATE_FILE): Promise<void> {
  const path = fromRepoRoot(file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getVendorState(state: State, vendor: string): VendorState {
  return state[vendor] ?? { seen: [], lastRun: null };
}

export function markSeen(state: State, vendor: string, entries: ChangelogEntry[]): State {
  const current = getVendorState(state, vendor);
  const seen = new Set(current.seen);
  for (const entry of entries) seen.add(entryKey(entry));

  return { ...state, [vendor]: { seen: [...seen], lastRun: new Date().toISOString() } };
}
