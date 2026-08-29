import type { VendorStatus } from "../types.ts";

/**
 * "Is any of this real?" — answered before anything else on the page.
 *
 * Each vendor says whether its changelog was fetched live this run or replayed from a
 * committed capture. The demo is allowed to use cached data; it is not allowed to imply
 * otherwise, so the distinction is the first thing on screen rather than a footnote.
 */
export function Vendors({ vendors }: { vendors: VendorStatus[] }) {
  if (vendors.length === 0) return null;

  return (
    <div className="vendors">
      {vendors.map((v) => (
        <span key={v.vendor} className={`vendor-chip vendor-chip--${v.provenance}`}>
          <span className="vendor-chip__dot" aria-hidden="true" />
          <strong>{v.vendor}</strong>
          <span className="vendor-chip__prov">
            {v.provenance === "live" ? "live via Bright Data" : "committed capture"}
          </span>
          {v.entries > 0 && <span className="vendor-chip__n">{v.entries} entries</span>}
        </span>
      ))}
    </div>
  );
}
