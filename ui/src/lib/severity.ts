/**
 * The browser's copy of the classifier's contract.
 *
 * The rules live in pipeline/src/lib/severity.ts, which the UI cannot import — it is Node
 * code in another workspace package. What is duplicated here is deliberately only the
 * derivation from a UiEvent's own detail; the wording of every verdict still comes from the
 * pipeline, arriving as `because`, so the two cannot drift into saying different things
 * about the same change.
 */

import type { Severity, UiEvent } from "../adapter.ts";

const DAY = 86_400_000;

export function daysPast(date: string, now = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((start - target) / DAY);
}

/**
 * Classify from what the event actually carries.
 *
 * Used only when the pipeline did not classify it — an older stored session, say. It
 * returns `undefined` rather than guessing "fyi", because a change we could not classify
 * is not the same as one we decided is unimportant.
 */
export function severityOf(detail: NonNullable<UiEvent["detail"]>, now = new Date()):
  | { severity: Severity; alreadyPast?: boolean }
  | undefined {
  if (detail.severity) return { severity: detail.severity, alreadyPast: detail.alreadyPast };
  if (!detail.shutdownDate) return undefined;

  return { severity: "breaks", alreadyPast: daysPast(detail.shutdownDate, now) >= 0 };
}

/** "1 breaking now · 2 FYI". Empty when nothing has been classified. */
export function countsLine(events: UiEvent[], now = new Date()): string {
  const seen = new Map<string, { severity: Severity; alreadyPast?: boolean }>();

  for (const e of events) {
    const v = e.detail && severityOf(e.detail, now);
    // One entry per vendor: the same change arrives many times as a run progresses, and
    // counting each arrival turns one problem into a crowd.
    if (v) seen.set(e.detail?.vendor ?? e.message, v);
  }

  const all = [...seen.values()];
  const parts: string[] = [];

  const past = all.filter((v) => v.severity === "breaks" && v.alreadyPast).length;
  const soon = all.filter((v) => v.severity === "breaks" && !v.alreadyPast).length;
  const behaviour = all.filter((v) => v.severity === "behaviour").length;
  const fyi = all.filter((v) => v.severity === "fyi").length;

  if (past) parts.push(`${past} breaking now`);
  if (soon) parts.push(`${soon} breaks soon`);
  if (behaviour) parts.push(`${behaviour} behaviour`);
  if (fyi) parts.push(`${fyi} FYI`);

  return parts.join(" · ");
}
