/**
 * A fixture-backed source repository (CLAUDE.md §7).
 *
 * Returns the shapes the real client returns, including the one that matters most: a
 * comparison capped at GitHub's 300-file ceiling, so the truncation path is exercised
 * without asking the network to produce 300 files.
 */

import type { ReleaseNote, SourceDiff } from "./source.ts";

export const NOTES: ReleaseNote[] = [
  {
    tag: "v5.1.0",
    published: "2025-03-31T00:00:00Z",
    title: "5.1.0",
    body: "* response: add support for ETag option in res.sendFile by @juanarbol",
    url: "https://github.com/expressjs/express/releases/tag/v5.1.0",
  },
  {
    tag: "v5.0.0",
    published: "2024-09-10T00:00:00Z",
    title: "5.0.0",
    body: "- **Routing changes**: Updated to `path-to-regexp@8.x`, removing sub-expression regex patterns",
    url: "https://github.com/expressjs/express/releases/tag/v5.0.0",
  },
];

/** Same signature as the real client, so a test cannot pass against a shape production lacks. */
export async function releases(_repo: string, _pages = 4): Promise<ReleaseNote[]> {
  return NOTES;
}

export async function compare(
  _repo: string,
  base: string,
  head: string,
  symbols: string[],
  _pkg = "",
): Promise<SourceDiff> {
  const hits = symbols.includes("res.send")
    ? [{ file: "lib/response.js", symbol: "res.send", lines: ["-  res.send(404)"], kind: "code" as const }]
    : [];

  return {
    base,
    head,
    commits: 292,
    filesChanged: 300,
    // Exactly the cap: the case where "nothing found" means "not fully looked".
    truncated: true,
    hits,
    url: `https://github.com/expressjs/express/compare/${base}...${head}`,
  };
}
