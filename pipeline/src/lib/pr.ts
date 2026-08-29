import { classify } from "./classify.ts";
import type { ChangelogEntry, Provenance, SymbolMatch } from "../types.ts";

export interface PrContent {
  title: string;
  body: string;
}

export interface PatchResult {
  patched: boolean;
  diff: string;
  testsPassed: boolean;
  log: string;
  reason?: string;
}

/** Fence a body of untrusted vendor text so it cannot be mistaken for instructions. */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function provenanceNote(provenance: Provenance): string {
  return provenance === "live"
    ? "Scraped live via Bright Data."
    : `Served from ${provenance === "fixture" ? "a committed fixture" : "cache"} (DEMO_MODE).`;
}

function describeMatches(matches: SymbolMatch[]): string {
  if (matches.length === 0) return "_no watched symbols matched_";
  return matches
    .map((m) => `\`${m.symbol}\` (${m.how === "code" ? "code span" : "prose"})`)
    .join(", ");
}

/**
 * Build the PR description.
 *
 * A judge should be able to read the PR alone and understand what happened
 * (docs/PLAN.md §4 H5), so it carries the changelog excerpt, the source link, why we
 * thought it was breaking, why we thought it was ours, and the test log.
 */
export function buildPr(input: {
  entry: ChangelogEntry;
  matches: SymbolMatch[];
  patch: PatchResult;
  provenance: Provenance;
  targetPaths: string[];
}): PrContent {
  const { entry, matches, patch, provenance, targetPaths } = input;
  const signals = classify(entry).signals;

  const body = [
    `## What upstream changed`,
    ``,
    `**${entry.vendor}** · ${entry.date} · [source](${entry.url})`,
    ``,
    `### ${entry.title}`,
    ``,
    quote(entry.body),
    ``,
    `_${provenanceNote(provenance)}_`,
    ``,
    `## Why this is ours`,
    ``,
    `- Breaking signals: ${signals.length ? signals.map((s) => `\`${s}\``).join(", ") : "_none_"}`,
    `- Matched symbols: ${describeMatches(matches)}`,
    `- Watched paths: ${targetPaths.map((p) => `\`${p}\``).join(", ") || "_none_"}`,
    ``,
    `## The patch`,
    ``,
    patch.diff.trim() ? ["```diff", patch.diff.trim(), "```"].join("\n") : "_no diff_",
    ``,
    `## Tests`,
    ``,
    patch.testsPassed ? "✅ Passing in the sandbox." : "❌ **Failing.**",
    ``,
    "```",
    patch.log.trim() || "(no output)",
    "```",
    ``,
    `---`,
    ``,
    `🤖 Opened by [Upstream Watch](https://github.com/truefoundry/trueforge). ` +
      `**Not merged** - this PR is waiting on a human approval checkpoint (CLAUDE.md §2.3).`,
  ].join("\n");

  return { title: `fix(${entry.vendor}): ${entry.title}`, body };
}
