import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { ChangelogEntry } from "../types.ts";

/**
 * Last-known entries per vendor, committed for demo reproducibility
 * (docs/ARCHITECTURE.md §1, specs/scraper-pipeline.md §2.5).
 */
export function statePath(vendor: string): string {
  return `pipeline/state/${vendor}.last.json`;
}

export interface VendorState {
  vendor: string;
  lastCheck: string | null;
  /** `${date}::${title}` for every entry we have already reported. */
  seen: string[];
}

/** Entry identity is (date, title) per specs/scraper-pipeline.md §3. */
export function entryKey(entry: Pick<ChangelogEntry, "date" | "title">): string {
  return `${entry.date}::${entry.title}`;
}

export async function loadState(vendor: string, file?: string): Promise<VendorState> {
  const path = file ?? statePath(vendor);
  let raw: string;

  try {
    raw = await readFile(fromRepoRoot(path), "utf8");
  } catch (cause) {
    // A missing file is a genuine cold start. Anything else - a permission error, a
    // transient I/O failure - must not silently baseline the page, because that suppresses
    // every change since the last good run.
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { vendor, lastCheck: null, seen: [] };
    }
    throw new ConfigError(`Could not read state file ${path}`, { cause: String(cause) });
  }

  try {
    return JSON.parse(raw) as VendorState;
  } catch (cause) {
    throw new ConfigError(
      `State file ${path} is not valid JSON. Delete it to start fresh, or fix it — ` +
        `silently baselining would hide every change since the last good run.`,
      { cause: String(cause) },
    );
  }
}

export async function saveState(state: VendorState, file?: string): Promise<void> {
  const path = fromRepoRoot(file ?? statePath(state.vendor));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function withSeen(state: VendorState, entries: ChangelogEntry[]): VendorState {
  const seen = new Set(state.seen);
  for (const entry of entries) seen.add(entryKey(entry));

  return { ...state, lastCheck: new Date().toISOString(), seen: [...seen] };
}
