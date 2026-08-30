/**
 * The request, with the one key that changed marked in place.
 *
 * A reader comparing two JSON blobs side by side has to find the difference themselves,
 * and on a wide object they will not. Striking the removed value and highlighting the new
 * one does that work — the same treatment API-diff tools use for a removed field, because
 * people already know how to read it.
 */
export function RequestDiff({
  body,
  changedKey,
  side,
}: {
  body: unknown;
  /** The key whose value the upstream change forced. */
  changedKey?: string;
  side: "before" | "after";
}) {
  if (body === null || typeof body !== "object") {
    return <pre className="overflow-x-auto text-[12px] text-dim">{String(body ?? "(no request)")}</pre>;
  }

  const entries = Object.entries(body as Record<string, unknown>);

  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-[12px] leading-relaxed">
      <span className="text-dim">{"{"}</span>
      {entries.map(([key, value]) => {
        const changed = key === changedKey;
        const rendered = JSON.stringify(value);

        return (
          <div key={key} className="pl-3">
            <span className={changed ? "text-fg" : "text-dim"}>&quot;{key}&quot;</span>
            <span className="text-dim">: </span>
            {changed ? (
              <span
                className={
                  side === "before"
                    ? "text-bad line-through decoration-bad/70"
                    : "rounded bg-ok/15 px-1 text-ok"
                }
              >
                {rendered}
              </span>
            ) : (
              <span className="text-dim">{rendered}</span>
            )}
            <span className="text-dim">,</span>
          </div>
        );
      })}
      <span className="text-dim">{"}"}</span>
    </pre>
  );
}
