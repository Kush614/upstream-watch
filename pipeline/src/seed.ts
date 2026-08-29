/**
 * `pnpm demo:seed` — put the demo back to a known cold start (CLAUDE.md §5).
 *
 * 1. Clear last-seen state and cached scrapes.
 * 2. Replay the BASELINE fixture so the four existing entries are already "seen".
 *
 * Step 2 is what makes the demo land: when the run then sees the breaking fixture, the
 * seeded entry is the *only* new one, so the agent reacts to exactly one thing on camera
 * rather than to a vendor's whole backlog.
 */

import { execFileSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FixtureScraperClient } from "./clients/index.ts";
import { fromRepoRoot } from "./lib/paths.ts";
import { run } from "./run.ts";

const CACHE_DIR = "agent/fixtures/html";

async function clearScrapeCache(): Promise<number> {
  const dir = fromRepoRoot(CACHE_DIR);
  const files = (await readdir(dir)).filter((f) => f.includes("-scrape-"));

  for (const file of files) {
    await rm(join(dir, file), { force: true });
  }
  return files.length;
}

function demoAppIsDirty(): boolean {
  try {
    return execFileSync("git", ["status", "--porcelain", "demo-app"], {
      cwd: fromRepoRoot(),
      encoding: "utf8",
    }).trim().length > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await rm(fromRepoRoot(".upstream-watch/state.json"), { force: true });
  const cleared = await clearScrapeCache();

  const report = await run({ client: new FixtureScraperClient("baseline") });
  const baseline = report.vendors[0];

  console.log(
    [
      ``,
      `demo:seed`,
      `  cleared      ${cleared} cached scrape(s), reset last-seen state`,
      `  baselined    ${baseline?.entriesFound ?? 0} entries for ${report.vendors.length} vendor(s)`,
      ``,
      demoAppIsDirty()
        ? `  ⚠ demo-app has uncommitted changes — likely a patch from an earlier run.\n` +
          `    Run: git restore demo-app   (check the diff first)`
        : `  ✓ demo-app is clean`,
      ``,
      `Next: DEMO_MODE=1 DEMO_FIXTURE=breaking pnpm check`,
      ``,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`demo:seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
