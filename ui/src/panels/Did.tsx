import type { DoneItem } from "../types.ts";

/** Did — what the watch has actually done (specs/ui.md §Did). */
export function Did({ done }: { done: DoneItem[] }) {
  if (done.length === 0) {
    return <p className="empty">Nothing yet.</p>;
  }

  return (
    <ul className="done">
      {done.map((item) => (
        <li key={item.id} className="done__row">
          <span className={`pill pill--${item.status}`}>{item.status}</span>
          <a href={item.prUrl} target="_blank" rel="noreferrer noopener">
            #{item.prNumber}
          </a>
          <span className="done__title">{item.title}</span>
          <span className="done__vendor">{item.vendor}</span>
          <time>{item.at.slice(0, 16).replace("T", " ")}</time>
        </li>
      ))}
    </ul>
  );
}
