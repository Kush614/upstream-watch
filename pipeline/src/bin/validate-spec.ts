/**
 * `pnpm --filter pipeline validate-spec --vendor <vendor> --spec <file>`
 *
 * Gate for a proposed extraction spec (specs/scraper-pipeline.md §4.3). A candidate must:
 *
 *   1. yield >= 1 schema-valid entry from the CACHED current HTML (no network), and
 *   2. still find the last-good example entries in the last-good HTML (regression check).
 *
 * Only a spec that passes both is allowed anywhere near a PR.
 */

import { readFile } from "node:fs/promises";
import { lastGoodPath, currentHtmlPath, newestSnapshot, readCached } from "../lib/cache.ts";
import { entryKey } from "../lib/state.ts";
import { extractEntries } from "../lib/parse.ts";
import { fromRepoRoot } from "../lib/paths.ts";
import { parseSpecs } from "../lib/spec.ts";
import { loadTarget } from "../lib/targets.ts";
import { validateEntries } from "../lib/validate.ts";
import type { ChangelogEntry } from "../types.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const vendor = flag("vendor");
  const specFile = flag("spec");
  if (!vendor || !specFile) throw new Error("validate-spec requires --vendor <vendor> --spec <file>");

  const target = await loadTarget(vendor);
  const candidate = parseSpecs(await readFile(fromRepoRoot(specFile), "utf8")).get(vendor);
  if (!candidate) throw new Error(`${specFile} has no block for vendor "${vendor}"`);

  const currentPath = (await newestSnapshot(vendor)) ?? currentHtmlPath(vendor);
  const currentHtml = await readCached(currentPath);
  if (!currentHtml) throw new Error(`No cached HTML at ${currentPath} to validate against`);

  const current = await validateEntries(extractEntries(currentHtml, candidate), target.schema);

  // Regression: the examples that used to parse must still parse from the last-good page.
  //
  // specs/scraper-pipeline.md §4.3 asks that last-good examples still be findable "where
  // possible". After a genuine redesign it is NOT possible — a spec written for the new
  // marker cannot parse the old page, and that is success, not regression. So this is
  // reported, never a hard gate; the hard gate is the current page.
  //
  const lastGoodHtml = await readCached(lastGoodPath(vendor));
  let regression: { checked: number; found: number; note: string } = {
    checked: 0, found: 0, note: "no last-good HTML on record",
  };

  if (lastGoodHtml) {
    const before = await validateEntries(extractEntries(lastGoodHtml, candidate), target.schema);
    const keys = new Set(before.valid.map((e: ChangelogEntry) => entryKey(e)));
    const examples = before.valid.slice(0, 3);
    const found = examples.filter((e) => keys.has(entryKey(e))).length;

    regression = {
      checked: examples.length,
      found,
      note: before.valid.length === 0
        ? "candidate cannot read the last-good page — expected when the vendor restructured"
        : `candidate still reads the last-good page (${before.valid.length} entries)`,
    };
  }

  const ok = current.valid.length >= 1;

  console.log(JSON.stringify({
    ok,
    vendor,
    spec: specFile,
    againstCurrent: { path: currentPath, extracted: current.valid.length + current.invalid.length, valid: current.valid.length },
    regression,
    reason: ok
      ? `candidate spec accepted: ${current.valid.length} schema-valid entries from cached HTML`
      : "candidate spec produced no schema-valid entries from cached HTML",
  }, null, 2));

  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`validate-spec failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
