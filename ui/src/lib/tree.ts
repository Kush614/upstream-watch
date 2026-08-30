/**
 * One tree over everything upstream of this repo.
 *
 * The page had two unrelated lists — vendors with changelog pages, and nothing at all for
 * dependencies. But they are the same thing from the reader's side: something outside this
 * repo that can break it. The difference is only how much of it you get to read, and that
 * difference is worth showing rather than hiding.
 *
 * A vendor has one source. A package has three, and they disagree — which is the finding.
 */

import type { OssProof, PackageFinding, VendorRow } from "../adapter.ts";

export type Tone = "ok" | "warn" | "bad" | "dim";

export interface Node {
  id: string;
  label: string;
  /** Short right-aligned status, e.g. "4.19.2 → 5.2.1" or "cache". */
  badge?: string;
  tone?: Tone;
  children?: Node[];
  detail?: Detail;
}

export interface Detail {
  title: string;
  /** One plain sentence: what this node means for the reader. */
  summary: string;
  /** Quoted evidence, each with where it came from. */
  facts: Array<{ label: string; value: string; url?: string; mono?: boolean }>;
  /** Files in THIS repo that the node can break. */
  yours?: string[];
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function vendorNode(v: VendorRow): Node {
  const matches = v.result?.matches ?? [];

  return {
    id: `api:${v.vendor}`,
    label: v.vendor,
    badge: v.source === "cache" ? "cached" : matches.length > 0 ? plural(matches.length, "match") : "live",
    tone: matches.length > 0 ? "warn" : v.source === "cache" ? "dim" : "ok",
    detail: {
      title: v.vendor,
      summary:
        v.source === "cache"
          ? "Watched from a committed capture, not fetched live. Only what this vendor chooses to publish is readable, and right now we cannot even fetch that."
          : "A hosted API. Its changelog is the only thing we can read — there is no source to check it against.",
      facts: [
        { label: "changelog", value: v.url, url: v.url },
        { label: "watching for", value: v.symbols.join(", "), mono: true },
        { label: "last look", value: v.stateError ?? (v.lastCheck ? new Date(v.lastCheck).toLocaleString() : "never") },
        ...(v.pinnedBecause ? [{ label: "why cached", value: v.pinnedBecause }] : []),
        ...matches.map((m) => ({ label: m.date, value: m.body || m.title, url: m.url })),
      ],
      yours: v.files,
    },
  };
}

/**
 * The fourth source, and the only one that is not a reading of someone else's words:
 * both versions installed and run.
 */
function proofNode(proof: OssProof, parentId: string): Node {
  const broke = proof.before.healthy && !proof.after.healthy;

  return {
    id: `${parentId}:proof`,
    label: "run on both versions",
    badge: broke ? "breaks" : proof.after.healthy ? "still works" : "check",
    tone: broke ? "bad" : proof.after.healthy ? "ok" : "warn",
    detail: {
      title: `${proof.symbol} — before and after`,
      summary: broke
        ? "The same probe, run against both versions. Nothing here is inferred from a changelog."
        : "The same probe against both versions did not show a break on this symbol.",
      facts: [
        { label: `before · ${proof.before.version}`, value: `${proof.before.observed}\n${proof.before.detail}`, mono: true },
        { label: `after · ${proof.after.version}`, value: `${proof.after.observed}\n${proof.after.detail}`, mono: true },
        ...(proof.probe ? [{ label: "the probe both sides ran", value: proof.probe, mono: true }] : []),
        { label: "run at", value: new Date(proof.at).toLocaleString() },
      ],
    },
  };
}

function packageNode(p: PackageFinding, proof?: OssProof): Node {
  // Role belongs in the id: the same package appears twice — once as a real dependency of
  // this repo and once as a labelled reference break — and a shared id makes the tree
  // silently render one of them twice.
  const id = `pkg:${p.role}:${p.package}`;
  const code = p.inSource.filter((h) => h.kind === "code");
  const behind = p.majorsBehind === 0;

  // The disagreement between sources is the finding, so it decides the colour.
  const tone: Tone = behind ? "ok" : code.length > 0 && p.announced.length === 0 ? "bad" : "warn";

  const children: Node[] = [
    {
      id: `${id}:registry`,
      label: "registry",
      badge: `${p.pinned} → ${p.latest}`,
      tone: behind ? "ok" : "warn",
      detail: {
        title: `${p.package} on npm`,
        summary: behind
          ? "You are on the current major."
          : `${plural(p.majorsBehind, "major")} behind. The break has been one ‘npm update’ away since ${p.breakAvailableSince?.slice(0, 10) ?? "an unknown date"}.`,
        facts: [
          { label: "you have", value: p.pinned, mono: true },
          { label: "published", value: p.latest, mono: true },
          ...(p.breakAvailableSince ? [{ label: "reachable since", value: p.breakAvailableSince.slice(0, 10) }] : []),
          ...(p.daysSincePinned !== null ? [{ label: "your version's age", value: `${p.daysSincePinned} days` }] : []),
        ],
      },
    },
    {
      id: `${id}:releases`,
      label: "release notes",
      badge: p.announced.length > 0 ? plural(p.announced.length, "mention") : "silent",
      tone: p.announced.length > 0 ? "warn" : "dim",
      detail: {
        title: "What the maintainers wrote down",
        summary:
          p.announced.length > 0
            ? "These notes mention something this repo calls."
            : "No release note above your version mentions anything you use — which is not the same as nothing having changed.",
        facts: p.announced.map((a) => ({ label: a.tag, value: a.quote, url: a.url })),
      },
    },
    {
      id: `${id}:source`,
      label: "the code itself",
      badge: code.length > 0 ? plural(code.length, "change") : "none found",
      tone: code.length > 0 ? "bad" : "dim",
      detail: {
        title: "What actually changed",
        summary:
          code.length > 0
            ? `${plural(code.length, "change")} to something you call, across ${p.filesChanged ?? 0} changed files and ${p.commits ?? 0} commits. This is the source, not the announcement.`
            : "Nothing in the diff touches a symbol this repo uses.",
        facts: [
          ...(p.compareUrl ? [{ label: "full diff", value: p.compareUrl, url: p.compareUrl }] : []),
          ...code.slice(0, 8).map((h) => ({ label: `${h.file} [${h.symbol}]`, value: h.lines.join("\n"), mono: true })),
        ],
      },
    },
  ];

  if (proof) children.push(proofNode(proof, id));

  return {
    id,
    label: p.package,
    badge: behind ? "current" : p.severity === "silent" ? "silent break" : `${plural(p.majorsBehind, "major")} behind`,
    tone,
    children,
    detail: {
      title: `${p.package} — ${p.repo}`,
      summary: p.role === "reference"
        ? (p.note ?? "A known break kept for demonstration. It is not a claim about this repo.")
        : behind
        ? "On the current major."
        : p.severity === "silent"
          ? "This break does not throw. The old call still works and now means something else, so nothing fails until a user notices."
          : "A breaking change is available above your version.",
      facts: [
        { label: "repository", value: `https://github.com/${p.repo}`, url: `https://github.com/${p.repo}` },
        { label: p.role === "reference" ? "the symbol that changed" : "you call", value: p.symbols?.join(", ") ?? "", mono: true },
        // A symbol nobody calls cannot break you, and reporting it as though it could is
        // the same fabrication as an invented version.
        ...(p.unusedSymbols?.length
          ? [{ label: "declared but not found in your files", value: p.unusedSymbols.join(", "), mono: true }]
          : []),
      ].filter((f) => f.value),
      yours: p.files,
    },
  };
}

/** The whole tree. Groups exist so the reader sees the asymmetry immediately. */
export function buildTree(vendors: VendorRow[], packages: PackageFinding[], proofs: OssProof[] = []): Node[] {
  const proofOf = new Map(proofs.map((p) => [p.package, p]));
  const mine = packages.filter((p) => p.role === "dependency");
  const refs = packages.filter((p) => p.role === "reference");

  const groups: Node[] = [
    {
      id: "group:apis",
      label: "Hosted APIs",
      badge: `${vendors.length} watched · 1 source each`,
      tone: "dim",
      children: vendors.map(vendorNode),
    },
    {
      id: "group:deps",
      label: "Your dependencies",
      badge: `${mine.length} watched · versions read from your manifests`,
      tone: "dim",
      // Only a real dependency gets a proof node: running two majors of something this repo
      // does not install would prove nothing about this repo.
      children: mine.map((p) => packageNode(p, proofOf.get(p.package))),
    },
  ];

  // Kept separate and named plainly. Folding these in with real dependencies is how a
  // demonstration turns into a false claim about your codebase — which is what this file
  // used to do for express, react-dom and eslint alike.
  if (refs.length > 0) {
    groups.push({
      id: "group:refs",
      label: "Reference breaks",
      badge: "not your code — shown because they are reproducible",
      tone: "dim",
      children: refs.map((p) => packageNode(p, proofOf.get(p.package))),
    });
  }

  return groups;
}

/** Depth-first lookup, so a selected id survives a refresh of the data behind it. */
export function findNode(nodes: Node[], id: string): Node | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findNode(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}
