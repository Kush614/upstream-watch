/**
 * The fields agent/prompts/pr-body.md expects, derived rather than written.
 *
 * The template is a file (CLAUDE.md §7) and this fills it. Two fields carry most of the
 * weight and neither is decorative:
 *
 *   severityLine — leads with the consequence, not the machinery. "Breaking now" and
 *                  "FYI" are different asks of a reviewer, and a reader should know which
 *                  one this is before reading anything else.
 *   verification — the compatibility signal. Dependabot's version of this is a score
 *                  derived from other people's CI. Ours is better, and only because the
 *                  deprecation already happened: we can say the live API returns 404 for
 *                  the retired thing, rather than that we simulated a future date.
 */

import type { SeverityVerdict } from "./severity.ts";

export interface VerificationFacts {
  /** What the OLD code got from the real upstream. */
  before?: { version: string; observed: string };
  /** What the NEW code gets from the same real upstream. */
  after?: { version: string; observed: string };
  /** Absent when the runner printed no summary — never defaulted to zero. */
  counts?: { passed: number; failed: number };
  /** Whether the suite passed, which we know even when the counts are unreadable. */
  passed: boolean;
}

export function severityLine(v: SeverityVerdict): string {
  switch (v.severity) {
    case "breaks":
      return v.alreadyPast
        ? `## Breaking now, since ${v.shutdown}`
        : v.shutdown
          ? `## Breaks on ${v.shutdown}`
          : "## Breaking change";
    case "behaviour":
      return "## Behaviour change — nothing throws";
    default:
      return "## FYI — nothing here calls it";
  }
}

/**
 * One sentence a reviewer can act on, and never a claim we did not measure.
 *
 * If there is no before/after pair, this says the tests passed and nothing more. Implying
 * upstream verification we did not perform is the failure this whole project is about.
 */
export function verification(f: VerificationFacts): string {
  // "0/0 tests pass" for an unreadable summary would dress a run we could not measure as a
  // clean one. Say what we know and no more.
  const tests = f.counts
    ? `${f.counts.passed}/${f.counts.passed + f.counts.failed} tests pass`
    : f.passed
      ? "the suite passed, though its summary could not be parsed for counts"
      : "the suite did not pass";

  if (!f.before || !f.after) {
    return `${tests}. No upstream call was made, so this says nothing about how the vendor behaves.`;
  }

  return (
    `Checked against the live upstream, which already refuses the old call: ` +
    `\`${f.before.version}\` → ${f.before.observed}, \`${f.after.version}\` → ${f.after.observed}. ${tests}.`
  );
}

/** Which vendor data was live and which was cached (CLAUDE.md §6). */
export function provenance(vendor: string, source: "live" | "cache", why?: string): string {
  return source === "live"
    ? `**Provenance.** \`${vendor}\` was read live during this run.`
    : `**Provenance.** \`${vendor}\` was read from a committed capture, not fetched live.${why ? ` ${why}` : ""}`;
}
