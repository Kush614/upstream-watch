import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UiEvent } from "../adapter.ts";

/**
 * The trace: the sentence the vendor wrote, and the line of your code it affects, joined by
 * one curve. It answers "how do you know?" without a word of explanation.
 *
 * The changelog text is third-party data — it is rendered as text and the highlight is
 * applied by splitting around the matched sentence, never by injecting markup.
 */
export function ThreadView({ detail }: { detail: NonNullable<UiEvent["detail"]> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLElement>(null);
  const to = useRef<HTMLElement>(null);
  const [path, setPath] = useState("");

  const excerpt = detail.changelog?.excerpt ?? "";
  const sentence = detail.changelog?.sentence ?? "";
  const idx = sentence ? excerpt.indexOf(sentence) : -1;
  const [head, tail] = idx >= 0 ? [excerpt.slice(0, idx), excerpt.slice(idx + sentence.length)] : [excerpt, ""];

  const changedLines = (detail.diff ?? "")
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"));

  const draw = () => {
    const box = wrap.current?.getBoundingClientRect();
    const a = from.current?.getBoundingClientRect();
    const b = to.current?.getBoundingClientRect();
    if (!box || !a || !b) return;

    const x1 = a.right - box.left;
    const y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left;
    const y2 = b.top + b.height / 2 - box.top;
    const mid = (x2 - x1) / 2;

    setPath(`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`);
  };

  useLayoutEffect(draw);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener("resize", draw);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, []);

  return (
    <div ref={wrap} className="relative mt-5 grid gap-6 border-t border-line pt-5 md:grid-cols-2">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={path} fill="none" stroke="var(--state)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" />
      </svg>

      <div className="min-w-0">
        <h4 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-dim">what they published</h4>
        <p className="text-[13.5px] leading-relaxed text-dim">
          {head}
          {idx >= 0 && (
            <mark ref={from as React.RefObject<HTMLElement>} className="rounded bg-[var(--state)]/25 px-1 text-ink">
              {sentence}
            </mark>
          )}
          {tail}
        </p>
      </div>

      <div className="min-w-0">
        <h4 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-dim">
          {detail.files?.[0] ?? "your code"}
        </h4>
        <pre className="overflow-x-auto rounded-lg border border-line bg-[var(--bg)] p-3 font-mono text-[12px]">
          {changedLines.slice(0, 6).map((l, i) => {
            const added = l.startsWith("+");
            const first = i === 0;
            return (
              <span
                key={i}
                ref={first ? (to as React.RefObject<HTMLElement>) : undefined}
                className={`block ${added ? "text-ok" : "text-bad"} ${first ? "rounded bg-[var(--state)]/15 px-1" : ""}`}
              >
                {l}
              </span>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
