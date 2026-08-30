import { useState } from "react";
import type { UiEvent } from "../adapter.ts";

/**
 * The case for the change, in the order a reviewer builds it.
 *
 * Announcement → Impact → Fix → Verification → Review. Each step is one piece of evidence,
 * collapsed until asked for, because the person approving this does not need all five to
 * decide — they need to know which one they doubt, and open that.
 *
 * Every step renders only from what the run produced. A step with nothing behind it says so
 * rather than showing an empty shell that implies the work was done.
 */

type Detail = NonNullable<UiEvent["detail"]>;

function Step({
  n,
  title,
  summary,
  children,
  defaultOpen,
}: {
  n: number;
  title: string;
  summary: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <li className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2.5 py-2.5 text-left"
      >
        <span className="w-4 shrink-0 font-mono text-[12px] text-dim">{n}</span>
        <span className="flex-1">
          <span className="text-[13.5px] font-medium">{title}</span>
          <span className="ml-2 text-[13px] text-dim">{summary}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[11px] text-dim">{open ? "▴" : "▾"}</span>
      </button>

      {open && children && <div className="pb-3 pl-[1.6rem]">{children}</div>}
    </li>
  );
}

const Quote = ({ children }: { children: React.ReactNode }) => (
  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-[11.5px] leading-snug text-dim">
    {children}
  </pre>
);

export function FixStepper({ detail }: { detail: Detail }) {
  const { changelog, symbol, files, diff, tests, review, vendor } = detail;
  const failed = tests?.failed ?? 0;

  return (
    <ol className="mt-3 border-t border-line">
      <Step
        n={1}
        title="Announcement"
        summary={changelog ? changelog.title : "none found"}
        defaultOpen
      >
        {changelog ? (
          <div className="grid gap-1.5">
            <span className="inline-block w-fit rounded border border-bad px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-bad">
              breaking
            </span>
            <Quote>{changelog.excerpt}</Quote>
            <a href={changelog.url} target="_blank" rel="noreferrer" className="text-[12px] text-dim underline decoration-line underline-offset-2">
              {vendor ? `${vendor}'s own page` : "the vendor's page"}
            </a>
          </div>
        ) : (
          // No announcement is itself the finding for a silent change.
          <p className="text-[13px] text-dim">
            Nothing in the release notes mentions this. That is not reassurance — it is how this
            kind of change reaches production.
          </p>
        )}
      </Step>

      <Step
        n={2}
        title="Impact"
        summary={symbol ? `${symbol} · ${files?.length ?? 0} file${files?.length === 1 ? "" : "s"}` : "unknown"}
      >
        <div className="grid gap-1">
          {symbol && <Quote>{symbol}</Quote>}
          {files?.length ? (
            <ul className="grid gap-0.5">
              {files.map((f) => (
                <li key={f} className="font-mono text-[12px] text-warn">{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-dim">No file was identified.</p>
          )}
        </div>
      </Step>

      <Step n={3} title="Fix" summary={diff ? `${diff.split("\n").filter((l) => /^[+-][^+-]/.test(l)).length} lines` : "no diff"}>
        {diff ? (
          <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-[11.5px] leading-snug">
            {diff.split("\n").map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "text-ok"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "text-bad"
                      : "text-dim"
                }
              >
                {line || " "}
              </div>
            ))}
          </pre>
        ) : (
          <p className="text-[13px] text-dim">No diff was recorded for this change.</p>
        )}
      </Step>

      <Step
        n={4}
        title="Verification"
        summary={tests ? `${tests.passed}/${tests.passed + failed} pass` : "not run"}
      >
        {tests ? (
          <div className="grid gap-1.5">
            <p className={`text-[13px] ${failed > 0 ? "text-bad" : "text-ok"}`}>
              {failed > 0
                ? `${failed} test${failed === 1 ? "" : "s"} still failing. This is not ready to merge.`
                : `${tests.passed} tests pass against the live upstream.`}
            </p>
            {tests.output && <Quote>{tests.output.split("\n").slice(-8).join("\n")}</Quote>}
          </div>
        ) : (
          <p className="text-[13px] text-dim">
            No test run was recorded, so this says nothing about whether the fix works.
          </p>
        )}
      </Step>

      <Step
        n={5}
        title="Review"
        summary={review?.findings?.length ? `${review.findings.length} findings` : review ? "reviewed" : "not reviewed"}
      >
        {review?.findings?.length ? (
          <ul className="grid gap-1">
            {review.findings.map((f) => (
              <li key={f.title} className="flex items-baseline gap-2 text-[13px]">
                <span className={f.status === "open" ? "text-bad" : "text-dim"}>
                  {f.status === "resolved" ? "✓" : f.status === "dismissed" ? "–" : "!"}
                </span>
                <span className={f.status === "open" ? "" : "text-dim"}>{f.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-dim">
            {review ? "Reviewed, no findings recorded here." : "No review has run on this yet."}
          </p>
        )}
      </Step>
    </ol>
  );
}
