import type { Timeline } from "../adapter.ts";

/**
 * Announced → detected → fixed → merged, against the date it stops working.
 *
 * The gap at the end is the number worth having, and it points both ways. Fixed before the
 * date is the product working as advertised. Fixed after it is the reason the product
 * exists — your service was already wrong and nothing told you. Rendering only the happy
 * direction would mean the metric disappears exactly when it has the most to say.
 */

const DAY = 86_400_000;

function days(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY);
}

const short = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function VendorTimeline({ timeline, vendor }: { timeline: Timeline; vendor?: string }) {
  const steps = [
    { key: "announced", label: "announced", at: timeline.announced },
    { key: "detected", label: "detected", at: timeline.detected },
    { key: "fixed", label: "fixed", at: timeline.fixed },
    { key: "merged", label: "merged", at: timeline.merged },
  ].filter((s): s is { key: string; label: string; at: string } => Boolean(s.at));

  if (steps.length === 0) return null;

  const landed = timeline.merged ?? timeline.fixed;
  const gap = landed && timeline.shutdown ? days(timeline.shutdown, landed) : null;

  return (
    <div className="grid gap-2">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true" className="text-dim">→</span>}
            <span className="text-dim">{s.label}</span>
            <span className="font-mono tabular-nums">{short(s.at)}</span>
          </li>
        ))}

        {timeline.shutdown && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-dim">·</span>
            <span className="text-dim">stops working</span>
            <span className="font-mono tabular-nums">{short(timeline.shutdown)}</span>
          </li>
        )}
      </ol>

      {gap !== null && (
        <p className={`text-[13px] ${gap <= 0 ? "text-ok" : "text-bad"}`}>
          {gap <= 0 ? (
            <>
              Fixed <strong>{Math.abs(gap)} days</strong> before {vendor ?? "the vendor"} turned it off.
            </>
          ) : (
            <>
              <strong>{gap} days exposed.</strong> It stopped working on {short(timeline.shutdown as string)} and
              nothing noticed until we looked.
            </>
          )}
        </p>
      )}
    </div>
  );
}
