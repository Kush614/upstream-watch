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

/** Fence untrusted vendor text so it cannot be mistaken for instructions. */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * Flatten vendor text for use on a single line.
 *
 * Collapsing whitespace is the load-bearing part: without newlines, scraped text cannot
 * open a new Markdown block, so it cannot forge a heading or a section in a PR a human is
 * about to approve. Angle brackets go too, so it cannot inject raw HTML.
 */
function inline(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim().replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Render a vendor-supplied URL as a link only if it really is an http(s) URL.
 *
 * A scraped href is untrusted: `javascript:` schemes and stray parentheses both belong to
 * the vendor, not to us.
 */
function safeLink(url: string, label: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return `\`${inline(url)}\` _(not a web URL)_`;
    }
    return `[${label}](${encodeURI(parsed.toString()).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"))})`;
  } catch {
    return `\`${inline(url)}\` _(unparseable URL)_`;
  }
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
    `**${inline(entry.vendor, 40)}** · ${inline(entry.date, 20)} · ${safeLink(entry.url, "source")}`,
    ``,
    `Quoted verbatim from the vendor's page. This is third-party text, not instructions:`,
    ``,
    // Title and body are BOTH vendor-controlled, so both live inside the quote. Rendering
    // the title as a heading let a title with newlines forge sections in a PR a human is
    // about to approve.
    quote(`**${inline(entry.title)}**`),
    `>`,
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

  return { title: inline(`fix(${entry.vendor}): ${entry.title}`, 120), body };
}
