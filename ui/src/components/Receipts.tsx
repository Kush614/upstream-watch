import { useState } from "react";
import type { UiEvent } from "../adapter.ts";
import { ThreadView } from "./ThreadView.tsx";

/** A chip only exists if its URL does. Never fabricate a receipt. */
function Chip({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-dim transition-colors hover:border-dim hover:text-ink"
    >
      {children} ↗
    </a>
  );
}

export function Receipts({ detail }: { detail: NonNullable<UiEvent["detail"]> }) {
  const [thread, setThread] = useState(false);
  const anyReceipt = detail.changelog?.url || detail.pr?.url || detail.review?.url || detail.commit?.url;

  if (!anyReceipt) return null;

  return (
    <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip href={detail.changelog?.url}>what they said</Chip>
        <Chip href={detail.pr?.url}>the change</Chip>
        <Chip href={detail.review?.url}>code review</Chip>
        <Chip href={detail.commit?.url}>commit {detail.commit?.sha?.slice(0, 7)}</Chip>

        {detail.changelog?.url && (
          <button
            className="ml-auto text-[13px] text-dim underline-offset-4 hover:underline"
            onClick={() => setThread((v) => !v)}
            aria-expanded={thread}
          >
            trace it {thread ? "▴" : "▾"}
          </button>
        )}
      </div>

      {thread && <ThreadView detail={detail} />}
    </section>
  );
}
