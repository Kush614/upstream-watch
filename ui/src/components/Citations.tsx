import { useState } from "react";
import type { Citation } from "../adapter.ts";

/**
 * The chain under a column: what was announced, what the code asks for, what came back,
 * and what that did to the tests.
 *
 * Each link states a claim in plain words, then shows the literal thing it was read from
 * and where that came from. Collapsed by default — someone who trusts the columns should
 * not have to read four quotes, and someone who does not should be able to check all four.
 */
export function Citations({ citations, tone }: { citations: Citation[]; tone: "bad" | "ok" }) {
  const [open, setOpen] = useState(false);

  if (citations.length === 0) {
    // Silence beats a placeholder. An empty "Why?" reads as though evidence exists.
    return null;
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[12.5px] text-dim underline decoration-line underline-offset-2"
      >
        {open ? "Hide the evidence" : `Why? · ${citations.length} sources`}
      </button>

      {open && (
        <ol className="mt-3 grid gap-3">
          {citations.map((c, i) => (
            <li key={c.claim} className="grid gap-1">
              <div className="flex gap-2">
                <span className={`shrink-0 text-[12px] ${tone === "bad" ? "text-bad" : "text-ok"}`}>{i + 1}.</span>
                <p className="text-[13.5px] leading-snug">{c.claim}</p>
              </div>

              <pre className="ml-5 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg px-2.5 py-2 text-[12px] leading-snug text-dim">
                {c.evidence}
              </pre>

              <p className="ml-5 text-[12px] text-dim">
                {c.source}
                {c.url && (
                  <>
                    {" "}
                    <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">
                      check it yourself
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
