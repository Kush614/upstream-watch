import type { ChangelogEntry, MismatchStats } from "../types.ts";
import type { ValidationResult } from "./validate.ts";

/**
 * Structure-change detection — "the interesting one" (specs/scraper-pipeline.md §3).
 *
 * A vendor redesigning their page is signal, not failure. The thresholds are the spec's:
 * 0 entries parsed, OR >= 30% of entries fail schema, OR a required field empty in > 50%.
 */
const INVALID_RATIO_LIMIT = 0.3;
const EMPTY_FIELD_LIMIT = 0.5;

const REQUIRED_FIELDS = ["date", "title", "body", "url"] as const;

export interface MismatchVerdict {
  mismatch: boolean;
  reason: string;
  stats: MismatchStats;
}

export function detectMismatch(extracted: ChangelogEntry[], validation: ValidationResult): MismatchVerdict {
  const total = extracted.length;
  const invalid = validation.invalid.length;
  const invalidRatio = total === 0 ? 1 : invalid / total;

  const emptyFields = REQUIRED_FIELDS.filter((field) => {
    if (total === 0) return false;
    const empty = extracted.filter((e) => !String(e[field] ?? "").trim()).length;
    return empty / total > EMPTY_FIELD_LIMIT;
  });

  const stats: MismatchStats = {
    extracted: total,
    valid: validation.valid.length,
    invalid,
    invalidRatio: Number(invalidRatio.toFixed(3)),
    emptyFields: [...emptyFields],
  };

  if (total === 0) {
    return { mismatch: true, reason: "Extraction produced 0 entries.", stats };
  }
  if (invalidRatio >= INVALID_RATIO_LIMIT) {
    return {
      mismatch: true,
      reason: `${invalid} of ${total} entries (${Math.round(invalidRatio * 100)}%) failed schema validation: ${validation.invalid[0]?.errors ?? ""}`,
      stats,
    };
  }
  if (emptyFields.length > 0) {
    return {
      mismatch: true,
      reason: `Required field(s) empty in more than half the entries: ${emptyFields.join(", ")}.`,
      stats,
    };
  }

  return { mismatch: false, reason: "", stats };
}
