/**
 * `pnpm demo:break-page` — simulate the vendor redesigning their changelog
 * (specs/scraper-pipeline.md §5).
 *
 * Swaps the cached `current.html` for `restructured.html`: same entries, different shape.
 * A check then has to notice a SchemaMismatch, repair its own extraction spec, and put
 * that repair through review. `pnpm demo:restore-page` puts it back.
 *
 * Only touches the cache, never the live path — with DEMO_MODE=1 the pipeline reads
 * `current.html`, so this is how the beat is staged without waiting for Stripe to
 * actually redesign anything.
 */

import { copyFile, rm, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = process.argv.includes("--vendor")
  ? (process.argv[process.argv.indexOf("--vendor") + 1] ?? "stripe")
  : "stripe";

const dir = `${ROOT}/agent/fixtures/html/${VENDOR}`;
const current = `${dir}/current.html`;
const restructured = `${dir}/restructured.html`;
const backup = `${dir}/.pre-break.html`;

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function main(): Promise<void> {
  if (process.argv.includes("--restore")) {
    if (!(await exists(backup))) {
      console.log(`nothing to restore for ${VENDOR} (no ${backup.replace(ROOT + "/", "")})`);
      return;
    }
    await copyFile(backup, current);
    await rm(backup, { force: true });
    console.log(`restored ${VENDOR} current.html from before the break`);
    return;
  }

  if (!(await exists(restructured))) {
    throw new Error(`No ${restructured.replace(ROOT + "/", "")} to swap in`);
  }
  // Keep the good copy so the demo is repeatable without a live re-scrape.
  if (!(await exists(backup)) && (await exists(current))) await copyFile(current, backup);

  await copyFile(restructured, current);
  console.log(
    [
      ``,
      `${VENDOR}: changelog page "redesigned" — current.html now has the restructured DOM.`,
      ``,
      `  next:  DEMO_MODE=1 pnpm check           # expect SchemaMismatch, not a crash`,
      `         pnpm repair --vendor ${VENDOR}        # build the repair context`,
      `         pnpm demo:restore-page          # put it back`,
      ``,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`break-page failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
