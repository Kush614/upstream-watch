import { useState } from "react";
import type { PendingApproval } from "../types.ts";

/**
 * Waiting on — the approval card (specs/ui.md §Waiting on).
 *
 * Changelog excerpt on the left, the proposed diff on the right, test result and PR link
 * in the footer. This is the irreversible step, and the only thing on screen that can
 * cause one is the Approve button.
 */
export function WaitingOn({
  pending,
  onDecide,
  busy,
  connected,
}: {
  pending: PendingApproval[];
  onDecide: (id: string, decision: "approve" | "reject", reason?: string) => void;
  busy: string | null;
  /** False when reading the local feed: there is no session to send a decision to. */
  connected: boolean;
}) {
  if (pending.length === 0) {
    return <p className="empty">Nothing waiting on you.</p>;
  }
  return (
    <>
      {!connected && (
        <p className="notice">
          Preview from the local feed. Approving needs a live TrueForge session — start the
          harness and the buttons become active.
        </p>
      )}
      {pending.map((item) => (
        <ApprovalCard
          key={item.id}
          item={item}
          onDecide={onDecide}
          busy={busy === item.id}
          connected={connected}
        />
      ))}
    </>
  );
}

function ApprovalCard({
  item,
  onDecide,
  busy,
  connected,
}: {
  item: PendingApproval;
  onDecide: (id: string, decision: "approve" | "reject", reason?: string) => void;
  busy: boolean;
  connected: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <article className="card">
      <header className="card__head">
        <span className="vendor">{item.entry.vendor}</span>
        <span className="dot">·</span>
        <time>{item.entry.date}</time>
        {item.entry.breaking && <span className="badge badge--breaking">breaking</span>}
      </header>

      <div className="card__cols">
        <section className="card__col">
          <h4>What upstream changed</h4>
          <p className="entry-title">{item.entry.title}</p>
          {/* Vendor text. Rendered as text, never as markup. */}
          <blockquote>{item.entry.body}</blockquote>
          <a className="src" href={item.entry.url} target="_blank" rel="noreferrer noopener">
            source ↗
          </a>
          {item.entry.symbols.length > 0 && (
            <p className="symbols">
              matched {item.entry.symbols.map((s) => <code key={s}>{s}</code>)}
            </p>
          )}
        </section>

        <section className="card__col">
          <h4>Proposed patch</h4>
          <p className="files">{item.files.map((f) => <code key={f}>{f}</code>)}</p>
          <pre className="diff">
            {item.diff.split("\n").map((line, i) => (
              <span
                key={i}
                className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : undefined}
              >
                {line}
                {"\n"}
              </span>
            ))}
          </pre>
        </section>
      </div>

      <footer className="card__foot">
        <span className={`badge ${item.testsPassed ? "badge--pass" : "badge--fail"}`}>
          {item.testsPassed ? "tests pass" : "tests fail"}
        </span>
        <a href={item.prUrl} target="_blank" rel="noreferrer noopener">
          PR #{item.prNumber} ↗
        </a>

        <div className="actions">
          {rejecting ? (
            <>
              <input
                className="reason"
                placeholder="Why are you rejecting this?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                disabled={busy || !connected || reason.trim().length === 0}
                onClick={() => onDecide(item.id, "reject", reason.trim())}
              >
                Confirm reject
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setRejecting(true)} disabled={busy || !connected}>
                Reject
              </button>
              {/* The only irreversible control on the page. */}
              <button
                className="btn btn--primary"
                disabled={busy || !connected}
                title={connected ? undefined : "needs a live TrueForge session"}
                onClick={() => onDecide(item.id, "approve")}
              >
                {busy ? "Merging…" : "Approve & merge"}
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
