import { readFile } from "node:fs/promises";
import { fromRepoRoot } from "./paths.ts";
import { classify } from "./severity.ts";
import { severityLine, verification, provenance as provenanceLine } from "./pr-body-fields.ts";
import type { ChangeEvent, ChangelogEntry, Provenance } from "../types.ts";

/** Prompts live in files, never inline strings (CLAUDE.md §7). */
const TEMPLATE = "agent/prompts/pr-body.md";

/** The patcher subagent's contract (specs/patcher.md §Output). */
export interface PatchResult {
  passed: boolean;
  diff: string;
  testOutput: string;
  rationale: string;
  iterations: number;
  reason?: string;
}

/**
 * vitest's own summary, when it printed one.
 *
 * Anchored on the "Tests" line: a bare /(\d+) passed/ matches "Test Files 3 passed" first
 * and reports the file count. Returns undefined rather than zeroes when there is no summary
 * at all — a run we could not measure is not a run that passed nothing.
 */
export function countsFrom(output: string): { passed: number; failed: number } | undefined {
  const line = /^\s*Tests\s+(.+)$/m.exec(output.replace(/\u001b\[[0-9;]*m/g, ""))?.[1];
  if (!line) return undefined;

  return {
    passed: Number(/(\d+) passed/.exec(line)?.[1] ?? 0),
    failed: Number(/(\d+) failed/.exec(line)?.[1] ?? 0),
  };
}

export interface PrContent {
  title: string;
  body: string;
  draft: boolean;
}

/**
 * Flatten vendor text for single-line use.
 *
 * Collapsing whitespace is the load-bearing part: with no newlines, scraped text cannot
 * open a new Markdown block, so it cannot forge a heading in a PR a human is about to
 * approve. Angle brackets go too, so it cannot inject raw HTML.
 */
function inline(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim().replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Fence untrusted vendor text so it cannot be mistaken for instructions. */
function quote(text: string): string {
  return text.split("\n").map((line) => `> ${line}`).join("\n");
}

/** specs/agent.md §Approval checkpoint: changelog excerpt <= 40 words. */
export function excerpt(body: string, words = 40): string {
  const parts = body.replace(/\s+/g, " ").trim().split(" ");
  return parts.length <= words ? parts.join(" ") : `${parts.slice(0, words).join(" ")}…`;
}

/** Render a vendor-supplied URL as a link only if it really is an http(s) URL. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return `\`${inline(url)}\` (not a web URL)`;
    return parsed.toString();
  } catch {
    return `\`${inline(url)}\` (unparseable URL)`;
  }
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * Build the PR title and body from the template in agent/prompts/pr-body.md.
 *
 * A judge should be able to read the PR alone and understand what happened, so it carries
 * the changelog excerpt, the source link, the rationale, the files, and the test output.
 */
export async function buildPr(input: {
  event: Extract<ChangeEvent, { type: "change" }>;
  patch: PatchResult;
  provenance: Provenance;
  templateFile?: string;
  /** What the OLD code got from the real upstream, when a proof ran. */
  before?: { version: string; observed: string };
  /** What the NEW code gets from the same real upstream. */
  after?: { version: string; observed: string };
  /** Why this vendor is cached, when it is. */
  provenanceWhy?: string;
  /** The commit this PR is built on. */
  sha?: string;
}): Promise<PrContent> {
  const { event, patch, provenance } = input;
  const entry: ChangelogEntry = event.entry;
  const template = await readFile(fromRepoRoot(input.templateFile ?? TEMPLATE), "utf8");

  // The verdict leads the PR. "Breaking now" and "FYI" are different asks of a reviewer,
  // and they should know which one this is before reading anything else.
  const verdict = classify({
    touchesUs: event.relevance === "symbol-match",
    breaking: event.breaking,
    // entry.date is when they wrote it down; entry.shutdown is when it stops working, and
    // only the second is a deadline. Passing the first labelled every historical entry
    // "Breaking now" as of its own publication date.
    shutdown: entry.shutdown,
    symbol: event.symbols[0],
    vendor: entry.vendor,
  });

  const body = fill(template, {
    severityLine: severityLine(verdict),
    because: inline(verdict.because, 300),
    verification: verification({
      before: input.before,
      after: input.after,
      counts: countsFrom(patch.testOutput),
      passed: patch.passed,
    }),
    provenance: provenanceLine(entry.vendor, provenance === "live" ? "live" : "cache", input.provenanceWhy),
    vendor: inline(entry.vendor, 40),
    "entry.date": inline(entry.date, 20),
    // Title and body are BOTH vendor-controlled. Rendering the title as a bare heading let
    // a title containing newlines forge sections in a PR a human was about to approve.
    "entry.title": inline(entry.title),
    "entry.body_excerpt": quote(excerpt(entry.body)),
    "entry.url": safeUrl(entry.url),
    rationale: inline(patch.rationale || "(none given)", 400),
    files: event.files.map((f) => `\`${f}\``).join(", ") || "_none_",
    testOutput: patch.testOutput.trim() || "(no output)",
  });

  const footer = [
    ``,
    `---`,
    ``,
    `Scraped ${provenance === "live" ? "live via Bright Data" : "from a committed capture"} · ` +
      `${event.breaking ? "vendor-flagged breaking" : "matched a watched symbol"}` +
      (event.symbols.length ? ` · symbols: ${event.symbols.map((s) => `\`${s}\``).join(", ")}` : ``),
    patch.passed ? `` : `\n⚠️ **Tests did not pass** after ${patch.iterations} iteration(s). Opened as a draft; no approval requested.`,
    ``,
    `Opened by Upstream Watch · merge requires approval in the TrueForge session` +
      (input.sha ? ` · \`${inline(input.sha, 12)}\`` : ``),
  ].join("\n");

  return {
    title: inline(`fix(${entry.vendor}): ${entry.title}`, 120),
    body: body + footer,
    // Tests failing ⇒ draft PR, no approval requested (specs/agent.md §Failure modes).
    draft: !patch.passed,
  };
}
