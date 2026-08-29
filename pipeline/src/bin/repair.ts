/**
 * `pnpm --filter pipeline repair --vendor <vendor>`
 *
 * Prepares the context a model needs to propose a new extraction spec
 * (SKILL.md §Repair 1, specs/scraper-pipeline.md §4.1).
 *
 * Deliberately writes PATHS, not HTML. The skill's rule is "do not paste raw HTML into
 * chat context; refer to file paths" — and the current Stripe page is 3 MB.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { lastGoodPath, currentHtmlPath, newestSnapshot, readCached } from "../lib/cache.ts";
import { extractEntries } from "../lib/parse.ts";
import { fromRepoRoot } from "../lib/paths.ts";
import { loadSpec, SKILL_FILE } from "../lib/spec.ts";
import { loadTarget } from "../lib/targets.ts";
import { validateEntries } from "../lib/validate.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const vendor = flag("vendor");
  if (!vendor) throw new Error("repair requires --vendor <vendor>");

  const target = await loadTarget(vendor);
  const spec = await loadSpec(vendor);

  const currentPath = (await newestSnapshot(vendor)) ?? currentHtmlPath(vendor);
  const lastGood = lastGoodPath(vendor);
  const lastGoodHtml = await readCached(lastGood);

  // Three entries that used to parse, as worked examples for the regression check.
  const examples = lastGoodHtml
    ? (await validateEntries(extractEntries(lastGoodHtml, spec), target.schema)).valid.slice(0, 3)
    : [];

  const context = {
    vendor,
    url: target.url,
    currentHtmlPath: currentPath,
    lastGoodHtmlPath: lastGoodHtml ? lastGood : null,
    schemaPath: target.schema,
    specFile: SKILL_FILE,
    currentSpec: spec,
    examples,
    instructions: `Read agent/prompts/repair.md. Propose a replacement for the "${vendor}" block in ${SKILL_FILE}. Output a YAML block only. Then run: pnpm --filter pipeline validate-spec --vendor ${vendor} --spec <file>`,
  };

  const out = `pipeline/state/${vendor}.repair-context.json`;
  await mkdir(dirname(fromRepoRoot(out)), { recursive: true });
  await writeFile(fromRepoRoot(out), `${JSON.stringify(context, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ok: true, repairContext: out, examples: examples.length }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`repair failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
