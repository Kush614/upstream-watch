import { useMemo, useState } from "react";
import { buildTree, findNode, type Node, type Tone } from "../lib/tree.ts";
import type { OssProof, PackageFinding, VendorRow } from "../adapter.ts";

/**
 * Everything upstream of this repo, in one tree.
 *
 * Browse it like a file tree: groups, then each upstream, then — for a dependency — the
 * three sources that disagree about it. Selecting a leaf shows the evidence beside it
 * rather than expanding the row, so a deep node never pushes the rest off screen.
 *
 * The asymmetry is the argument. A hosted API has ONE source: whatever the vendor chose to
 * write. A dependency has three, and you can read all of them.
 */

const TONE: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  dim: "text-dim",
};

function Row({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: Node;
  depth: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = Boolean(node.children?.length);
  const isSelected = node.id === selected;

  return (
    <>
      <div
        className={`flex items-center gap-1.5 rounded-md pr-2 ${isSelected ? "bg-line/60" : "hover:bg-line/30"}`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => (hasChildren ? setOpen((o) => !o) : undefined)}
          aria-hidden={!hasChildren}
          tabIndex={hasChildren ? 0 : -1}
          className={`w-4 shrink-0 text-[11px] text-dim ${hasChildren ? "" : "invisible"}`}
        >
          {open ? "▾" : "▸"}
        </button>

        <button
          type="button"
          onClick={() => {
            onSelect(node.id);
            if (hasChildren) setOpen(true);
          }}
          className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1 text-left"
        >
          <span className={`truncate text-[13.5px] ${depth === 0 ? "font-semibold" : ""}`}>{node.label}</span>
          {node.badge && (
            <span className={`shrink-0 text-[11.5px] ${TONE[node.tone ?? "dim"]}`}>{node.badge}</span>
          )}
        </button>
      </div>

      {open &&
        node.children?.map((child) => (
          <Row key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
        ))}
    </>
  );
}

function Pane({ node }: { node?: Node }) {
  if (!node?.detail) {
    return <p className="text-[13px] text-dim">Pick anything on the left to see what it is and where that came from.</p>;
  }

  const { title, summary, facts, yours } = node.detail;

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-dim">{summary}</p>
      </div>

      {facts.length > 0 && (
        <dl className="grid gap-2">
          {facts.map((f, i) => (
            <div key={`${f.label}-${i}`} className="grid gap-0.5">
              <dt className="text-[11.5px] uppercase tracking-wide text-dim">{f.label}</dt>
              <dd className={f.mono ? "" : "text-[13px]"}>
                {f.mono ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg px-2.5 py-2 text-[11.5px] leading-snug text-dim">
                    {f.value}
                  </pre>
                ) : f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="break-words underline decoration-line underline-offset-2">
                    {f.value}
                  </a>
                ) : (
                  <span className="break-words">{f.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {yours && yours.length > 0 && (
        <div>
          <p className="text-[11.5px] uppercase tracking-wide text-dim">what it can break here</p>
          <ul className="mt-1 grid gap-0.5">
            {yours.map((f) => (
              <li key={f} className="font-mono text-[12px] text-warn">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Explorer({
  vendors,
  packages,
  proofs,
  problem,
}: {
  vendors: VendorRow[];
  packages: PackageFinding[];
  proofs: OssProof[];
  /** Why the tree is short, when it is. Never rendered as an empty tree. */
  problem?: string;
}) {
  const tree = useMemo(() => buildTree(vendors, packages, proofs), [vendors, packages, proofs]);
  const [selected, setSelected] = useState("");
  const node = useMemo(() => findNode(tree, selected), [tree, selected]);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Everything upstream of this repo</h2>
        <p className="text-[12.5px] text-dim">a hosted API gives you one source; a dependency lets you run both versions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-line bg-bg p-1.5">
          {problem ? (
            // An empty tree reads as "nothing upstream can hurt you", which is the single
            // most reassuring thing this page could say and the least likely to be true.
            <p className="p-3 text-[13px] text-bad" role="alert">
              Could not read the watchlist — {problem}. This is not an empty watchlist.
            </p>
          ) : (
            tree.map((n) => <Row key={n.id} node={n} depth={0} selected={selected} onSelect={setSelected} />)
          )}
        </div>

        <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-line bg-bg p-3.5">
          <Pane node={node} />
        </div>
      </div>
    </section>
  );
}
