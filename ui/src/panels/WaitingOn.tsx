import { useState } from "react";
import { splitDiff } from "../adapter.ts";
import type { PendingApproval } from "../types.ts";

/**
 * Waiting on — the approval card (specs/ui.md §Waiting on).
 *
 * Changelog on the left, the code before and after on the right, and the test result and
 * PR in the footer. This is the irreversible step, and the Approve button is the only
 * control on the page that can cause one.
 */
export function WaitingOn({
  pending, onDecide, busy, connected,
}: {
  pending: PendingApproval[];
  onDecide: (id: string, decision: "approve" | "reject", reason?: string) => void;
  busy: string | null;
  connected: boolean;
}) {
  if (pending.length === 0) {
    return <p className="empty">Nothing waiting on you. The watch is running; it will stop here when it wants to merge.</p>;
  }
  return (
    <>
      {!connected && (
        <p className="notice">
          Preview from the local feed. Approving needs a live TrueForge session.
        </p>
      )}
      {pending.map((item) => (
        <ApprovalCard key={item.id} item={item} onDecide={onDecide} busy={busy === item.id} connected={connected} />
      ))}
    </>
  );
}

function ApprovalCard({
  item, onDecide, busy, connected,
}: {
  item: PendingApproval;
  onDecide: (id: string, decision: "approve" | "reject", reason?: string) => void;
  busy: boolean;
  connected: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { before, after } = splitDiff(item.diff);

  return (
    <article className="card">
      <header className="card__head">
        <span className="badge badge--action">{item.action}</span>
        <span className="vendor">{item.entry.vendor}</span>
        {item.entry.date && <><span className="dot">·</span><time>{item.entry.date}</time></>}
        {item.entry.breaking && <span className="badge badge--breaking">breaking</span>}
        {item.provenance && (
          <span className={`badge badge--${item.provenance === "live" ? "live" : "cache"}`}>
            {item.provenance === "live" ? "scraped live" : "from capture"}
          </span>
        )}
      </header>

      <section className="card__why">
        <h4>What upstream changed</h4>
        <p className="entry-title">{item.entry.title}</p>
        {/* Vendor text: rendered as text, never as markup. */}
        {item.entry.body && <blockquote>{item.entry.body}</blockquote>}
        {item.entry.url && (
          <a className="src" href={item.entry.url} target="_blank" rel="noreferrer noopener">
            read it on the vendor's site ↗
          </a>
        )}
        {item.rationale && (
          <p className="rationale"><strong>Why this matters:</strong> {item.rationale}</p>
        )}
      </section>

      {item.diff && (
        <section className="card__diff">
          <h4>
            The change
            {item.files.length > 0 && <span className="files">{item.files.map((f) => <code key={f}>{f}</code>)}</span>}
          </h4>
          <div className="beforeafter">
            <div className="pane pane--before">
              <span className="pane__label">before</span>
              <pre>{before.map((l, i) => <span key={i} className="del">{l}{"\n"}</span>)}</pre>
            </div>
            <div className="pane pane--after">
              <span className="pane__label">after</span>
              <pre>{after.map((l, i) => <span key={i} className="add">{l}{"\n"}</span>)}</pre>
            </div>
          </div>
        </section>
      )}

      {item.testOutput && (
        <details className="card__tests">
          <summary>Test output from the sandbox</summary>
          <pre>{item.testOutput}</pre>
        </details>
      )}

      <footer className="card__foot">
        <span className={`badge ${item.testsPassed === true ? "badge--pass" : item.testsPassed === false ? "badge--fail" : ""}`}>
          {item.testsPassed === true ? "tests pass" : item.testsPassed === false ? "tests fail" : "test result unknown"}
        </span>
        {item.prBranch && <code className="branch">{item.prBranch}</code>}
        {item.prUrl && <a href={item.prUrl} target="_blank" rel="noreferrer noopener">pull request ↗</a>}

        <div className="actions">
          {rejecting ? (
            <>
              <input className="reason" placeholder="Why are you rejecting this?" value={reason}
                     onChange={(e) => setReason(e.target.value)} autoFocus />
              <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>Cancel</button>
              <button className="btn btn--danger" disabled={busy || !connected || reason.trim().length === 0}
                      onClick={() => onDecide(item.id, "reject", reason.trim())}>
                Confirm reject
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setRejecting(true)} disabled={busy || !connected}>Reject</button>
              {/* The only irreversible control on this page. */}
              <button className="btn btn--primary" disabled={busy || !connected}
                      title={connected ? undefined : "needs a live TrueForge session"}
                      onClick={() => onDecide(item.id, "approve")}>
                {busy ? "Merging…" : "Approve & merge"}
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
