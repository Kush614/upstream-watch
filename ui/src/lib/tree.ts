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

import type { PackageFinding, VendorRow } from "../adapter.ts";

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

function packageNode(p: PackageFinding): Node {
  const code = p.inSource.filter((h) => h.kind === "code");
  const behind = p.majorsBehind === 0;

  // The disagreement between sources is the finding, so it decides the colour.
  const tone: Tone = behind ? "ok" : code.length > 0 && p.announced.length === 0 ? "bad" : "warn";

  const children: Node[] = [
    {
      id: `pkg:${p.package}:registry`,
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
      id: `pkg:${p.package}:releases`,
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
      id: `pkg:${p.package}:source`,
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

  return {
    id: `pkg:${p.package}`,
    label: p.package,
    badge: behind ? "current" : p.severity === "silent" ? "silent break" : `${plural(p.majorsBehind, "major")} behind`,
    tone,
    children,
    detail: {
      title: `${p.package} — ${p.repo}`,
      summary: behind
        ? "On the current major."
        : p.severity === "silent"
          ? "This break does not throw. The old call still works and now means something else, so nothing fails until a user notices."
          : "A breaking change is available above your version.",
      facts: [
        { label: "repository", value: `https://github.com/${p.repo}`, url: `https://github.com/${p.repo}` },
        { label: "you call", value: p.symbols?.join(", ") ?? "", mono: true },
      ].filter((f) => f.value),
      yours: p.files,
    },
  };
}

/** The whole tree. Groups exist so the reader sees the asymmetry immediately. */
export function buildTree(vendors: VendorRow[], packages: PackageFinding[]): Node[] {
  return [
    {
      id: "group:apis",
      label: "Hosted APIs",
      badge: `${vendors.length} watched · 1 source each`,
      tone: "dim",
      children: vendors.map(vendorNode),
    },
    {
      id: "group:deps",
      label: "Dependencies",
      badge: `${packages.length} watched · 3 sources each`,
      tone: "dim",
      children: packages.map(packageNode),
    },
  ];
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
