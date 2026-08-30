import type { Severity } from "../adapter.ts";

/**
 * What kind of attention this needs, in the fewest words that stay true.
 *
 * "Breaking now" and "Breaks on 15 Sept" are deliberately different chips. One is a warning
 * you can plan around; the other means your service is already wrong and nobody noticed.
 * Collapsing them into one red badge loses the only distinction that changes what you do
 * this afternoon.
 */
export function SeverityBadge({
  severity,
  shutdown,
  alreadyPast,
  title,
}: {
  severity: Severity;
  shutdown?: string;
  alreadyPast?: boolean;
  title?: string;
}) {
  const { label, tone } =
    severity === "breaks"
      ? alreadyPast
        ? { label: "Breaking now", tone: "border-bad text-bad" }
        : { label: shutdown ? `Breaks ${shutdown}` : "Breaking", tone: "border-warn text-warn" }
      : severity === "behaviour"
        ? { label: "Behaviour change", tone: "border-warn text-warn" }
        : { label: "FYI", tone: "border-line text-dim" };

  return (
    <span
      title={title}
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
