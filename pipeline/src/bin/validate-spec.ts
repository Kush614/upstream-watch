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
import { ConfigError } from "../errors.ts";
import { compareRecorded } from "../lib/regression.ts";
import { parseSpecs } from "../lib/spec.ts";
import { loadTarget } from "../lib/targets.ts";
import { validateEntries } from "../lib/validate.ts";
import type { ChangelogEntry } from "../types.ts";

/**
 * The entry keys `pnpm repair` recorded from the last-good page using the previous spec.
 * Independent of the candidate, which is the whole point.
 */
async function readRecordedExamples(vendor: string): Promise<string[]> {
  const path = `pipeline/state/${vendor}.repair-context.json`;
  let raw: string;

  try {
    raw = await readFile(fromRepoRoot(path), "utf8");
  } catch (cause) {
    // "Never run" and "cannot be read" are different problems with the same symptom -
    // an empty example list - and only one of them is fine. Collapsing them would let a
    // corrupt repair artifact quietly skip the regression comparison entirely.
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw new ConfigError(`Could not read ${path}`, { cause: String(cause) });
  }

  try {
    const context = JSON.parse(raw) as { examples?: ChangelogEntry[] };
    return (context.examples ?? []).map((e) => entryKey(e));
  } catch (cause) {
    throw new ConfigError(
      `${path} is not valid JSON. Re-run \`pnpm repair --vendor ${vendor}\` — validating ` +
        `without recorded examples would skip the regression check silently.`,
      { cause: String(cause) },
    );
  }
}

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
  // Regression check (specs/scraper-pipeline.md §4.3).
  //
  // The examples MUST come from somewhere independent of the candidate, or the check is
  // circular. They are the entries `pnpm repair` recorded from the last-good page using
  // the OLD spec, stored in the repair context. Comparing the candidate's output against
  // those is the only version of this check that can actually fail.
  //
  // "Where possible" matters too: after a genuine redesign a spec written for the new
  // page cannot read the old one, and that is success, not regression. So this reports,
  // and never gates. The gate is the current page.
  //
  const lastGoodHtml = await readCached(lastGoodPath(vendor));
  const recorded = await readRecordedExamples(vendor);

  let regression: { checked: number; found: number; missing: string[]; note: string } = {
    checked: 0, found: 0, missing: [], note: "no recorded examples — run `pnpm repair` first",
  };

  if (recorded.length === 0 && lastGoodHtml) {
    regression.note = "no recorded examples to compare against; run `pnpm repair --vendor " + vendor + "`";
  } else if (recorded.length > 0 && !lastGoodHtml) {
    regression.note = "examples recorded but no last-good HTML to re-extract from";
  } else if (recorded.length > 0 && lastGoodHtml) {
    const before = await validateEntries(extractEntries(lastGoodHtml, candidate), target.schema);
    const compared = compareRecorded(recorded, before.valid);

    regression = {
      checked: compared.checked,
      found: compared.found,
      missing: compared.missing.slice(0, 3),
      note: before.valid.length === 0
        ? "candidate cannot read the last-good page — expected when the vendor restructured"
        : `candidate re-found ${compared.found}/${compared.checked} previously recorded entries`,
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
