import { useState } from "react";
import type { UiEvent } from "../adapter.ts";

/**
 * The only place on this page that can cause something irreversible.
 *
 * Plain language, no jargon in the default view: "safe copy", "code review", "the fix" —
 * the technical words live behind "Changes ▾" for anyone who wants them.
 */
export function NeedsYou({ detail, onApprove, onReject, busy }: {
  detail: NonNullable<UiEvent["detail"]>;
  onApprove: () => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const tests = detail.tests;
  const vendor = detail.vendor ?? "A service you use";

  return (
    <section className="animate-slideIn rounded-xl border border-accent/60 bg-panel p-5 sm:p-6">
      <p className="text-[17px] leading-relaxed">
        <span className="font-semibold capitalize">{vendor}</span> is removing something your app
        uses. I prepared a fix and tested it.
        {tests && (
          <span className="ml-2 whitespace-nowrap rounded-full border border-ok px-2.5 py-0.5 text-[13px] text-ok">
            ✓ {tests.passed}/{tests.passed + tests.failed}
          </span>
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {rejecting ? (
          <>
            <input
              className="min-w-[240px] flex-1 rounded-lg border border-line bg-[var(--bg)] px-3 py-2 text-sm text-ink outline-none focus:border-dim"
              placeholder="Why not?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button
              className="rounded-lg border border-bad bg-bad px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy || reason.trim().length === 0}
              onClick={() => onReject(reason.trim())}
            >
              Confirm
            </button>
          </>
        ) : (
          <>
            {/* The one primary button while this card is visible. */}
            <button
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={onApprove}
            >
              {busy ? "Applying…" : "Apply fix"}
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2.5 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              Not now
            </button>
            <button
              className="ml-auto text-sm text-dim underline-offset-4 hover:underline"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              changes {open ? "▴" : "▾"}
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-2">
          <div className="min-w-0">
            <h4 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-dim">what they said</h4>
            {/* Vendor text: rendered as text, never as markup. */}
            <blockquote className="border-l-2 border-line pl-3 text-[13.5px] text-dim">
              {detail.changelog?.excerpt || "—"}
            </blockquote>
          </div>
          <div className="min-w-0">
            <h4 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-dim">what changes</h4>
            <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-[var(--bg)] p-3 font-mono text-[12px] leading-relaxed">
              {(detail.diff ?? "").split("\n").map((l, i) => (
                <span
                  key={i}
                  className={l.startsWith("+") && !l.startsWith("+++") ? "block text-ok"
                    : l.startsWith("-") && !l.startsWith("---") ? "block text-bad"
                    : "block text-dim"}
                >
                  {l || " "}
                </span>
              ))}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
