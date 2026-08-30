import { useEffect, useRef, useState } from "react";
import type { Captures } from "../adapter.ts";

/**
 * Their page, before and after, under a divider you drag.
 *
 * The material is the raw HTML we captured on each scrape — the bytes the parser was handed,
 * not a screenshot someone took afterwards. That is what makes this a record rather than an
 * illustration.
 *
 * It renders nothing when the two captures are byte-identical. A divider laid over two
 * copies of the same page implies a redesign nobody made, and this component exists to
 * report one, not to suggest one.
 */
export function PageDiff({ captures, runner }: { captures?: Captures; runner: string }) {
  const [at, setAt] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => setAt(50), [captures?.before?.file, captures?.after?.file]);

  if (!captures?.before || !captures.after) return null;

  if (!captures.differ) {
    return (
      <p className="text-[13px] text-dim">
        The last two captures of {captures.vendor}&rsquo;s page are byte-identical. Nothing to compare —
        their layout has not moved since {new Date(captures.before.at).toLocaleDateString()}.
      </p>
    );
  }

  const src = (file: string) => `${runner}/capture/${captures.vendor}/${encodeURIComponent(file)}`;
  const when = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div className="grid gap-2">
      <div
        ref={frame}
        className="relative h-[22rem] overflow-hidden rounded-lg border border-line bg-bg"
      >
        <iframe
          title={`${captures.vendor} before`}
          src={src(captures.before.file)}
          sandbox=""
          className="absolute inset-0 h-full w-full bg-white"
        />

        <div className="absolute inset-0 overflow-hidden" style={{ width: `${at}%` }}>
          <iframe
            title={`${captures.vendor} after`}
            src={src(captures.after.file)}
            sandbox=""
            /* Fixed to the frame's width, not the clip's, so the page underneath does not
               reflow as the divider moves — otherwise the two sides never line up. */
            style={{ width: frame.current?.clientWidth ?? 0 }}
            className="absolute inset-y-0 left-0 h-full bg-white"
          />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-accent"
          style={{ left: `${at}%` }}
        />
      </div>

      <label className="grid gap-1">
        <span className="sr-only">Compare the two captures</span>
        <input
          type="range"
          min={0}
          max={100}
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </label>

      <p className="text-[12px] text-dim">
        Left: {when(captures.before.at)} · Right: {when(captures.after.at)}. Their page changed;
        we adapted how we read it.
      </p>
    </div>
  );
}
