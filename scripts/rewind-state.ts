/**
 * `pnpm demo:rewind --since 2026-08-20` — forget everything a vendor published on or
 * after a date, so the next check reports those real entries as new.
 *
 * This is how the demo shows a change without inventing one. Every entry it surfaces is
 * genuinely Stripe's, with Stripe's own `breaking` flag — we are only rewinding our own
 * memory of what we had already seen, which is exactly what a first run after a quiet
 * week looks like.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

async function main(): Promise<void> {
  const vendor = flag("vendor", "stripe")!;
  const since = flag("since");
  if (!since) throw new Error("demo:rewind requires --since YYYY-MM-DD");

  const path = `${ROOT}/pipeline/state/${vendor}.last.json`;
  const state = JSON.parse(await readFile(path, "utf8")) as { seen: string[]; lastCheck: string | null };

  const before = state.seen.length;
  // Keys are `${date}::${title}`, so a lexical compare on the date prefix is the filter.
  state.seen = state.seen.filter((key) => (key.split("::")[0] ?? "") < since);

  // Keep lastCheck set: this must look like a returning run, not a cold start, or the
  // pipeline will baseline silently instead of reporting.
  state.lastCheck ??= new Date().toISOString();

  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`${vendor}: forgot ${before - state.seen.length} entries published on/after ${since} (${state.seen.length} remain)`);
}

main().catch((error: unknown) => {
  console.error(`demo:rewind failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
