import type { ChangelogEntry } from "../types.ts";

/**
 * Signals that an entry describes a change that can break a caller.
 *
 * Deliberately a keyword heuristic rather than a model call: it is deterministic, free,
 * testable offline, and auditable on camera. The cost is precision - see
 * specs/scraper-pipeline.md §3 for the trade-off and when to revisit it.
 */
const BREAKING_SIGNALS: Array<{ id: string; pattern: RegExp }> = [
  { id: "breaking-change", pattern: /\bbreaking\s+change\b/i },
  { id: "deprecated", pattern: /\bdeprecat(?:e|ed|ing|ion)\b/i },
  { id: "will-be-removed", pattern: /\b(?:will\s+be|is|are|has\s+been)\s+removed\b/i },
  { id: "no-longer", pattern: /\bno\s+longer\s+(?:supported|available|accepted|returned)\b/i },
  { id: "must-migrate", pattern: /\b(?:must|should)\s+migrate\b/i },
  { id: "renamed", pattern: /\b(?:renamed|replaced)\s+(?:to|by|with)\b/i },
];

export interface Classification {
  breaking: boolean;
  /** Which signals fired. Shown in the PR body so a human can check the reasoning. */
  signals: string[];
}

export function classify(entry: Pick<ChangelogEntry, "title" | "body">): Classification {
  const text = `${entry.title}\n${entry.body}`;
  const signals = BREAKING_SIGNALS.filter((s) => s.pattern.test(text)).map((s) => s.id);
  return { breaking: signals.length > 0, signals };
}

/** Classify in place, returning a new entry. */
export function withClassification(entry: ChangelogEntry): ChangelogEntry {
  return { ...entry, breaking: classify(entry).breaking };
}
