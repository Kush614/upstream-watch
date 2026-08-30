import { useState } from "react";
import type { VendorResult, VendorRow } from "../adapter.ts";

/**
 * Everything this repo watches — not just the vendor the columns happen to be about.
 *
 * The proof columns tell one story in depth, which invites the fair question *what about
 * the rest?* This answers it per vendor, including the awkward parts: Stripe is pinned to a
 * committed capture because Bright Data will not fetch it, and the row says so rather than
 * quietly looking like the others.
 */
export function Watchlist({
  rows,
  onCheck,
}: {
  rows: VendorRow[];
  onCheck: (vendor: string) => Promise<VendorResult>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VendorResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const check = async (vendor: string) => {
    setBusy(vendor);
    setErrors((e) => ({ ...e, [vendor]: "" }));
    try {
      const result = await onCheck(vendor);
      setResults((r) => ({ ...r, [vendor]: result }));
    } catch (e) {
      // A failed check is a real fact about this vendor. Leaving the row blank would read
      // as "nothing found", which is a different and untrue statement.
      setErrors((err) => ({ ...err, [vendor]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Everything being watched</h2>
        <p className="text-[12.5px] text-dim">{rows.length} vendors · checks never consume the queue</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-dim">
              <th className="py-2 pr-3 font-medium">Vendor</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Watching for</th>
              <th className="py-2 pr-3 font-medium">Last look</th>
              <th className="py-2 pr-3 font-medium">Found</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const result = results[row.vendor] ?? row.result;
              const error = errors[row.vendor];
              return (
                <tr key={row.vendor} className="border-b border-line/60 align-top">
                  <td className="py-2.5 pr-3">
                    <a href={row.url} target="_blank" rel="noreferrer" className="font-medium capitalize underline decoration-line underline-offset-2">
                      {row.vendor}
                    </a>
                    <div className="text-[12px] text-dim">{row.files.join(", ")}</div>
                  </td>

                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[12px] ${
                        row.source === "live" ? "border-ok text-ok" : "border-warn text-warn"
                      }`}
                      title={row.pinnedBecause}
                    >
                      {row.source}
                    </span>
                    {row.pinnedBecause && <div className="mt-1 max-w-[220px] text-[11.5px] leading-snug text-dim">{row.pinnedBecause}</div>}
                  </td>

                  <td className="py-2.5 pr-3">
                    <code className="text-[12px] text-dim">{row.symbols.slice(0, 3).join(", ")}</code>
                    {row.symbols.length > 3 && <span className="text-[12px] text-dim"> +{row.symbols.length - 3}</span>}
                  </td>

                  <td className="py-2.5 pr-3 text-dim">
                    {row.stateError ? (
                      // "never checked" and "the record is unreadable" mean opposite things.
                      <span className="text-bad">{row.stateError}</span>
                    ) : (
                      <>
                        {row.lastCheck ? new Date(row.lastCheck).toLocaleString() : "never"}
                        <div className="text-[12px]">{row.entriesSeen} entries seen</div>
                      </>
                    )}
                  </td>

                  <td className="py-2.5 pr-3">
                    {error && <span className="text-bad">{error}</span>}
                    {!error && !result && <span className="text-dim">—</span>}
                    {!error && result?.failed && <span className="text-bad">scrape failed: {result.failed}</span>}
                    {!error && result && !result.failed && (
                      <>
                        {result.matches.length > 0 ? (
                          result.matches.map((m) => (
                            <a key={m.title + m.date} href={m.url} target="_blank" rel="noreferrer" className="block text-warn underline decoration-line underline-offset-2">
                              {m.date} · {m.title}
                            </a>
                          ))
                        ) : (
                          <span className="text-ok">nothing that touches your code</span>
                        )}
                        <div className="text-[12px] text-dim">
                          {result.entries} entries · {result.breakingElsewhere} breaking elsewhere
                        </div>
                      </>
                    )}
                  </td>

                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() => check(row.vendor)}
                      disabled={busy !== null}
                      className="whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[12.5px] disabled:opacity-40"
                    >
                      {busy === row.vendor ? "Looking…" : "Check now"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
