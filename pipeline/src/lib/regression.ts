import { entryKey } from "./state.ts";
import type { ChangelogEntry } from "../types.ts";

export interface RegressionResult {
  checked: number;
  found: number;
  missing: string[];
}

/**
 * Compare a candidate spec's output against independently recorded examples.
 *
 * The examples must come from somewhere the candidate did not produce — they are what
 * `pnpm repair` extracted from the last-good page using the PREVIOUS spec. Deriving them
 * from the candidate's own output makes the check circular and unable to fail, which is
 * exactly the bug this function exists to prevent recurring.
 */
export function compareRecorded(
  recordedKeys: string[],
  candidateEntries: ChangelogEntry[],
): RegressionResult {
  const candidateKeys = new Set(candidateEntries.map((e) => entryKey(e)));
  const missing = recordedKeys.filter((key) => !candidateKeys.has(key));

  return { checked: recordedKeys.length, found: recordedKeys.length - missing.length, missing };
}
