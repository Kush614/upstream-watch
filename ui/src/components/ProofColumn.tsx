import { useState } from "react";
import type { RunResult } from "../adapter.ts";
import { Citations } from "./Citations.tsx";
import { RequestDiff } from "./RequestDiff.tsx";


/**
 * The receipt records the whole exchange; the panel wants the body that was sent.
 *
 * Falls back to the receipt itself for older stored runs, which recorded the body directly.
 */
function requestBody(request: unknown): unknown {
  if (request && typeof request === "object" && "body" in request) {
    return (request as { body: unknown }).body;
  }
  return request;
}

/**
 * One side of the proof. Identical component for both columns — the only difference is the
 * commit it ran and what the live upstream said back.
 */
export function ProofColumn({ label, result, running }: {
  label: "before" | "after";
  result?: RunResult;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ok = result ? result.status < 400 : undefined;

  return (
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] uppercase tracking-[0.08em] text-dim">
          {label === "before" ? "your code before" : "the fix"}
        </h3>
        {result && <code className="font-mono text-[11px] text-dim">@{result.sha}</code>}
      </header>

      {!result && (
        <p className="py-8 text-center text-sm text-dim">{running ? "running…" : "not run yet"}</p>
      )}

      {result && (
        <>
          <RequestDiff body={requestBody(result.request)} changedKey={result.changedKey} side={label} />

          <div className="mt-3 flex items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[12px] ${
                ok ? "border-ok text-ok" : "border-bad text-bad"
              }`}
            >
              ● {result.status} {ok ? "ok" : ""}
            </span>
            <pre className="min-w-0 flex-1 overflow-hidden whitespace-pre-wrap font-mono text-[12px] text-dim">
              {result.responseExcerpt.split("\n").slice(0, 3).join("\n")}
            </pre>
          </div>

          <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
            <span className="text-sm">
              <span className="text-ok">{result.tests.passed} ✓</span>
              {result.tests.failed > 0 && <span className="ml-2 text-bad">{result.tests.failed} ✗</span>}
            </span>
            <button
              className="ml-auto text-[13px] text-dim underline-offset-4 hover:underline"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              show output {open ? "▴" : "▾"}
            </button>
          </div>

          {open && (
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-line bg-[var(--bg)] p-3 font-mono text-[11.5px] text-dim">
              {result.tests.output || "(no output)"}
            </pre>
          )}

          <Citations citations={result.citations ?? []} tone={result.tests.failed > 0 ? "bad" : "ok"} />
        </>
      )}
    </section>
  );
}
