/**
 * How much a change deserves of someone's attention.
 *
 * The point of this file is the FYI tier. A watcher that treats every breaking entry as
 * urgent produces the thing everyone already ignores — a wall of red that trains you to
 * stop reading it. A real OpenAI run yields 86 breaking deprecations and exactly one that
 * touches a symbol this repo calls; the other 85 must never open a PR or raise a card.
 *
 * Deliberately not a score. "Breaks on 15 September" is a fact a person can act on;
 * "severity 8.4" is a number they have to translate first.
 */

export type Severity = "breaks" | "behaviour" | "fyi";

export interface SeverityVerdict {
  severity: Severity;
  /** One plain sentence, for the badge's tooltip and the card. */
  because: string;
  /** The date it stops working, when one was published. */
  shutdown?: string;
  /** True when that date has already passed — you are not warned, you are late. */
  alreadyPast?: boolean;
}

export interface Classifiable {
  /** Did it match a symbol this repo actually uses? */
  touchesUs: boolean;
  /** The vendor's own breaking flag, or a major version bump. */
  breaking: boolean;
  /** A published shutdown date, if the vendor named one. */
  shutdown?: string;
  /**
   * The old call still works and now means something else.
   *
   * Ranked above a loud break on purpose: a loud one is found by the first person to run
   * the code, a silent one by a customer.
   */
  silent?: boolean;
  /** What matched, for the sentence. */
  symbol?: string;
  vendor?: string;
}

const day = 86_400_000;

/** Whole days from `date` to `now`; negative means the date is still ahead. */
export function daysPast(date: string, now = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((start - target) / day);
}

export function classify(c: Classifiable, now = new Date()): SeverityVerdict {
  const what = c.symbol ? `\`${c.symbol}\`` : "something this repo calls";

  // Nothing we call is affected. Kept visible in the watchlist, never escalated.
  if (!c.touchesUs) {
    return {
      severity: "fyi",
      because: c.breaking
        ? "A breaking change somewhere else in this vendor's surface. Nothing here calls it."
        : "Announced, but nothing here calls it.",
    };
  }

  if (c.shutdown) {
    const past = daysPast(c.shutdown, now) >= 0;
    return {
      severity: "breaks",
      shutdown: c.shutdown,
      alreadyPast: past,
      because: past
        ? `${what} stopped working on ${c.shutdown}. This is not a warning — it already happened.`
        : `${what} stops working on ${c.shutdown}.`,
    };
  }

  if (c.silent) {
    return {
      severity: "behaviour",
      because: `${what} still works and now does something different. Nothing will throw, so nothing will tell you.`,
    };
  }

  return c.breaking
    ? { severity: "breaks", because: `${what} was removed.` }
    : { severity: "behaviour", because: `${what} changed.` };
}

/** "1 breaking now · 1 behaviour · 2 FYI" — empty string when there is nothing to say. */
export function summarise(verdicts: SeverityVerdict[]): string {
  const breaks = verdicts.filter((v) => v.severity === "breaks");
  const parts: string[] = [];

  const past = breaks.filter((v) => v.alreadyPast).length;
  const future = breaks.length - past;
  if (past) parts.push(`${past} breaking now`);
  if (future) parts.push(`${future} breaks soon`);

  const behaviour = verdicts.filter((v) => v.severity === "behaviour").length;
  if (behaviour) parts.push(`${behaviour} behaviour`);

  const fyi = verdicts.filter((v) => v.severity === "fyi").length;
  if (fyi) parts.push(`${fyi} FYI`);

  return parts.join(" · ");
}
