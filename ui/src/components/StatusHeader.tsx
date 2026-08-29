import { daysAgo, type Phase } from "../adapter.ts";

/**
 * Always visible, top-right. Four states, one line, no jargon — this is the whole story
 * for anyone who reads nothing else on the page.
 */
export function StatusHeader({ phase, shutdownDate }: { phase: Phase; shutdownDate?: string }) {
  const days = shutdownDate ? daysAgo(shutdownDate) : 0;

  const { icon, text, tone } = (() => {
    switch (phase) {
      case "change_found":
      case "testing":
        return {
          icon: "▲",
          text: shutdownDate ? `Broke on ${shutdownDate} · ${days} days ago` : "Something changed",
          tone: "text-warn border-warn",
        };
      case "awaiting_approval":
        return { icon: "⟳", text: "Fix ready — needs you", tone: "text-accent border-accent" };
      case "merged":
      case "repaired":
        return { icon: "✓", text: "Fixed just now", tone: "text-ok border-ok" };
      case "error":
        return { icon: "✕", text: "Something went wrong", tone: "text-bad border-bad" };
      default:
        return { icon: "●", text: "Working", tone: "text-ok border-ok" };
    }
  })();

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${tone}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={phase === "awaiting_approval" ? "animate-pulseRing" : undefined}>
        {icon}
      </span>
      {text}
    </div>
  );
}
