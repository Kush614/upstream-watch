/**
 * Scraper runner (CLAUDE.md §5 - `pnpm --filter pipeline dev`).
 *
 * Prints a human-readable pass over every watched target. The agent consumes the same
 * `run()` through the skill; this entry point exists so a human can see what the agent
 * sees, which is most of the demo's credibility.
 */

import { isDemoMode } from "./clients/index.ts";
import { appendNote } from "./lib/notes.ts";
import { run } from "./run.ts";
import { UpstreamWatchError } from "./errors.ts";
import type { ChangeEvent } from "./types.ts";

function renderEvent(event: ChangeEvent): string[] {
  if (event.kind === "breaking-change") {
    const symbols = event.matches.map((m) => `\`${m.symbol}\``).join(", ");
    return [
      `  ⚠ BREAKING · ${event.entry.date} · ${event.entry.title}`,
      `      matched ${symbols} → ${event.targetPaths.join(", ")}`,
      `      ${event.entry.url}`,
    ];
  }

  return [
    `  🔧 EXTRACTION BROKEN · ${event.reason}`,
    `      cached: ${event.cachedHtmlPath}`,
    event.repairedSpec
      ? `      repair proposed: entry selector → "${event.repairedSpec.entry}"`
      : `      no repair found — needs a human`,
  ];
}

async function main(): Promise<number> {
  const report = await run();

  const lines: string[] = [
    ``,
    `upstream-watch · ${isDemoMode() ? "DEMO_MODE=1 (cached fixtures)" : "live"}`,
    ``,
  ];

  for (const vendor of report.vendors) {
    lines.push(
      `${vendor.vendor} — ${vendor.entriesFound} entries (${vendor.provenance}), ` +
        `${vendor.added} new${vendor.firstRun ? " · first run, baselining" : ""}`,
    );

    for (const event of vendor.events) lines.push(...renderEvent(event));

    for (const ignored of vendor.ignoredBreaking) {
      lines.push(`  · breaking but not ours: ${ignored.title}`);
    }
    lines.push(``);
  }

  const breaking = report.events.filter((e) => e.kind === "breaking-change").length;
  lines.push(
    breaking > 0
      ? `${breaking} change(s) need a patch. The agent takes it from here.`
      : `Nothing to do.`,
    ``,
  );

  console.log(lines.join("\n"));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch(async (error: unknown) => {
    // Top-level handler logs to NOTES.md in demo/dev (CLAUDE.md §7).
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nupstream-watch failed: ${message}\n`);

    await appendNote({
      summary: `pipeline run failed: ${message.slice(0, 60)}`,
      where: "pipeline/src/index.ts",
      symptom: message,
      cause: error instanceof UpstreamWatchError ? JSON.stringify(error.context) : undefined,
    });
    process.exit(1);
  });
