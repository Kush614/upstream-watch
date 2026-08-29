/**
 * `pnpm --filter pipeline scrape --vendor <vendor>`
 *
 * Emits ChangeEvent JSON on stdout for the watcher subagent
 * (specs/scraper-pipeline.md §2.6, SKILL.md §Steps).
 *
 * Flags:
 *   --vendor <v>   one vendor; omit for every vendor in targets.yaml
 *   --pretty       human-readable render instead of JSON
 *   --no-persist   do not record entries as seen (inspect without consuming)
 */

import { appendNote } from "../lib/notes.ts";
import { loadTargets } from "../lib/targets.ts";
import { scrapeAll, type VendorRun } from "../scrape.ts";
import { isDemoMode } from "../clients/index.ts";
import { UpstreamWatchError } from "../errors.ts";
import type { ChangeEvent } from "../types.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function render(runs: VendorRun[]): string {
  const lines = [``, `upstream-watch · ${isDemoMode() ? "DEMO_MODE=1 (cached)" : "live via Bright Data"}`, ``];

  for (const run of runs) {
    lines.push(
      `${run.vendor} — ${run.valid}/${run.extracted} entries valid (${run.provenance ?? "no fetch"}), ` +
        `${run.added} new${run.firstRun ? " · first run, baselining" : ""}`,
    );

    for (const event of run.events) lines.push(...renderEvent(event));
    lines.push(``);
  }

  const events = runs.flatMap((r) => r.events);
  const ours = events.filter((e) => e.type === "change" && e.relevance === "symbol-match").length;
  const other = events.filter((e) => e.type === "change" && e.relevance === "breaking-only").length;

  const broken = events.filter((e) => e.type === "SchemaMismatch" || e.type === "scrape_failed").length;

  lines.push(
    broken > 0
      ? `${broken} vendor(s) need attention before changes can be detected.`
      : ours > 0
      ? `${ours} change(s) touch our code and need a patch` + (other ? `; ${other} other breaking change(s) reported only.` : ".")
      : other > 0
        ? `Nothing of ours. ${other} breaking change(s) elsewhere in the vendor's API.`
        : `Nothing to do.`,
    ``,
  );
  return lines.join("\n");
}

function renderEvent(event: ChangeEvent): string[] {
  switch (event.type) {
    case "change": {
      const ours = event.relevance === "symbol-match";
      return [
        `  ${ours ? "⚠ BREAKING · OURS" : "· breaking elsewhere"} ${event.entry.date} — ${event.entry.title}`,
        ours
          ? `      symbols: ${event.symbols.join(", ")} → ${event.files.join(", ")}`
          : `      no watched symbol matched — reported, not patched`,
        `      ${event.entry.url}`,
      ];
    }
    case "SchemaMismatch":
      return [`  🔧 SCHEMA MISMATCH · ${event.reason}`, `      cached: ${event.cachedHtmlPath}`, `      run: pnpm --filter pipeline repair --vendor ${event.vendor}`];
    case "scrape_failed":
      return [`  ✖ SCRAPE FAILED after ${event.attempts} attempts · ${event.reason}`];
    case "repair_failed":
      return [`  ✖ REPAIR FAILED · ${event.reason}`];
  }
}

async function main(): Promise<void> {
  const only = flag("vendor");
  const targets = await loadTargets();
  const vendors = only ? [only] : targets.vendors.map((v) => v.vendor);

  const runs = await scrapeAll(vendors, { persist: !process.argv.includes("--no-persist") });

  if (process.argv.includes("--pretty")) {
    console.log(render(runs));
  } else {
    console.log(JSON.stringify(runs.flatMap((r) => r.events), null, 2));
  }

  // A scrape that could not fetch at all is a real failure; surface it in the exit code
  // so a scheduled run does not look healthy.
  if (runs.some((r) => r.events.some((e) => e.type === "scrape_failed"))) process.exitCode = 1;
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`scrape failed: ${message}`);

  await appendNote({
    summary: `pipeline scrape failed: ${message.slice(0, 60)}`,
    where: "pipeline/src/bin/scrape.ts",
    symptom: message,
    cause: error instanceof UpstreamWatchError ? JSON.stringify(error.context) : undefined,
  });
  process.exit(1);
});
