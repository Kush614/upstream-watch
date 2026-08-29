import type { DoneItem } from "../types.ts";

/** Did — what the watch has actually done (specs/ui.md §Did). */
export function Did({ done }: { done: DoneItem[] }) {
  if (done.length === 0) return <p className="empty">No pull requests yet this session.</p>;

  return (
    <ul className="done">
      {done.map((item) => (
        <li key={item.id} className="done__row">
          <span className={`pill pill--${item.status}`}>{item.status}</span>
          <span className="done__title">{item.title}</span>
          {item.branch && <code className="done__branch">{item.branch}</code>}
          <span className="done__meta">
            {item.vendor}
            {item.at && <> · {item.at.slice(11, 16)}</>}
            {item.prUrl && <> · <a href={item.prUrl} target="_blank" rel="noreferrer noopener">open ↗</a></>}
          </span>
        </li>
      ))}
    </ul>
  );
}
