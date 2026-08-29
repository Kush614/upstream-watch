import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "../src/lib/paths.ts";
import { saveState, type State } from "../src/lib/state.ts";

let counter = 0;

/** A state file unique to one test, so tests never share last-seen state. */
export function tempStateFile(): string {
  return `.upstream-watch/test-state-${process.pid}-${counter++}.json`;
}

export async function seedState(file: string, state: State): Promise<void> {
  await saveState(state, file);
}

/**
 * A vendor that has been seen before but has no entries recorded, so everything on the
 * page counts as new. Lets us exercise the added-entry paths without a first-run baseline.
 */
export function emptyButNotFirstRun(vendor: string): State {
  return { [vendor]: { seen: [], lastRun: "2026-08-01T00:00:00.000Z" } };
}

export async function cleanup(files: string[]): Promise<void> {
  for (const file of files) {
    await rm(fromRepoRoot(file), { force: true });
  }

  // Every scrape caches raw HTML (CLAUDE.md §6), including in tests. Tidy up after.
  const dir = fromRepoRoot("agent/fixtures/html");
  for (const name of await readdir(dir)) {
    if (name.includes("-scrape-")) await rm(join(dir, name), { force: true });
  }
}
