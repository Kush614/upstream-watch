/**
 * `pnpm demo:seed` — put the demo back to a known cold start (CLAUDE.md §5).
 *
 * Clears last-seen state for every vendor and replays each committed capture once, so the
 * entries already on the page are recorded as seen. A subsequent `pnpm demo:rewind` then
 * decides exactly which release should look new.
 *
 * This is documented in CLAUDE.md §5 and README, so it has to exist: a setup guide whose
 * first command is unknown to the package manager is worse than no guide.
 */

import { rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CachedScraperClient } from "../pipeline/src/clients/index.ts";
import { loadTargets } from "../pipeline/src/lib/targets.ts";
import { statePath } from "../pipeline/src/lib/state.ts";
import { scrapeVendor } from "../pipeline/src/scrape.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const { vendors } = await loadTargets();
  const lines: string[] = ["", "demo:seed"];

  for (const target of vendors) {
    await rm(`${ROOT}/${statePath(target.vendor)}`, { force: true });

    const run = await scrapeVendor(target.vendor, {
      client: new CachedScraperClient(`agent/fixtures/html/${target.vendor}/current.html`),
    });
    lines.push(`  ${target.vendor.padEnd(12)} baselined ${run.valid} entries (${run.provenance})`);
  }

  lines.push("", "Next: pnpm demo:rewind --vendor openai --since 2026-01-01 && pnpm check", "");
  console.log(lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(`demo:seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
