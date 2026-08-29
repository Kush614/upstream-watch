import type { ChangelogEntry } from "../types.ts";

/**
 * Decide whether an entry is breaking, and which watched symbols it touches.
 *
 * Two independent signals, per specs/agent.md §2 ("breaking: true OR entries mentioning
 * any symbol"):
 *
 *  - `breaking` — the vendor's own flag when the page publishes one, else the
 *    `breaking_hint` substrings from the extraction spec.
 *  - `symbols`  — substring matches against `targets.yaml[vendor].symbols`.
 *
 * specs/scraper-pipeline.md §3 folds symbols into the breaking flag itself. Kept separate
 * here because they answer different questions — "is this dangerous" and "is this ours" —
 * and the PR body is more honest when it can say which one fired.
 */

export interface Classification {
  breaking: boolean;
  /** Why we think so: the vendor's flag, or the hints that matched. */
  reasons: string[];
  symbols: string[];
}

export function classify(
  entry: Pick<ChangelogEntry, "title" | "body" | "breaking">,
  breakingHints: string[],
  symbols: string[],
  matchFields: Array<"title" | "body"> = ["title", "body"],
): Classification {
  const haystack = `${entry.title}\n${entry.body}`.toLowerCase();

  // Symbol matching may be narrowed to the title, for vendors whose body names the
  // replacement as well as the thing being removed.
  const symbolHay = matchFields
    .map((f) => (f === "title" ? entry.title : entry.body))
    .join("\n")
    .toLowerCase();

  const reasons: string[] = [];
  if (entry.breaking) reasons.push("vendor-flagged");

  for (const hint of breakingHints) {
    if (hint && haystack.includes(hint.toLowerCase())) reasons.push(`hint:${hint}`);
  }

  const matched = symbols.filter((symbol) => symbol && symbolHay.includes(symbol.toLowerCase()));

  return { breaking: reasons.length > 0, reasons, symbols: matched };
}
