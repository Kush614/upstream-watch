import { useEffect, useRef, useState } from "react";

/**
 * The paper. Types the outage, then strikes it through and types the correction when the
 * fix lands — the whole product in two sentences for someone who reads nothing else.
 */
export function Headline({ outage, fixed, merged, dateline }: {
  outage: string;
  fixed: string;
  merged: boolean;
  dateline?: string;
}) {
  const target = merged ? fixed : outage;
  const [shown, setShown] = useState("");
  const [striking, setStriking] = useState(false);
  const wasMerged = useRef(merged);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Strike the old line through before the new one types — the correction has to be seen
    // replacing something, or it reads as just another headline.
    const becameMerged = merged && !wasMerged.current;
    wasMerged.current = merged;

    if (reduced) {
      setShown(target);
      return;
    }

    let cancelled = false;
    let timer: number;

    const type = () => {
      let i = 0;
      setShown("");
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setShown(target.slice(0, i));
        if (i < target.length) timer = window.setTimeout(tick, 40);
      };
      tick();
    };

    if (becameMerged) {
      setStriking(true);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setStriking(false);
        type();
      }, 900);
    } else {
      type();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [target, merged]);

  return (
    <div className="rounded-xl bg-cream px-6 py-7 text-[#14100a] shadow-lg sm:px-9 sm:py-9">
      {dateline && (
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[#6b6152]">{dateline}</p>
      )}
      <h1
        className={`font-display text-[26px] leading-[1.18] tracking-[-0.015em] sm:text-[38px] ${
          striking ? "line-through decoration-[3px] decoration-[#b4382f]" : ""
        }`}
      >
        <span className={striking ? "" : "caret"}>{striking ? outage : shown}</span>
      </h1>
    </div>
  );
}
