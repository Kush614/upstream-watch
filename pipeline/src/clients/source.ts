/**
 * The source repository itself.
 *
 * This is the part a SaaS vendor cannot offer. For OpenAI the changelog is the only thing
 * we can read; for a dependency, the changelog is the LEAST authoritative source, because
 * the commits and the diff between two releases are right there — and the changes nobody
 * writes down are exactly the ones that reach production.
 *
 * Reads through the `gh` CLI so it inherits the user's existing auth (CLAUDE.md §4) rather
 * than asking for another token.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SourceError } from "../errors.ts";

const run = promisify(execFile);

export interface ReleaseNote {
  tag: string;
  published: string;
  title: string;
  body: string;
  url: string;
}

export interface SourceDiff {
  base: string;
  head: string;
  commits: number;
  filesChanged: number;
  /**
   * GitHub's compare endpoint returns at most 300 files.
   *
   * When it does, files beyond the cap were never examined — so "no changes to anything you
   * call" is not a finding, it is the absence of one. Every caller must say which it has.
   */
  truncated: boolean;
  /**
   * Files whose patch mentions a symbol we use.
   *
   * Split by kind, because they are not equal evidence. A hit in `lib/response.js` is the
   * behaviour changing. A hit in `History.md` is the changelog again, and counting it as a
   * source finding would inflate exactly the number this tool exists to compare against.
   */
  hits: Array<{ file: string; symbol: string; lines: string[]; kind: "code" | "docs" }>;
  url: string;
}

/** Prose or code. Markdown, changelogs and docs directories are prose. */
function kindOf(path: string): "code" | "docs" {
  return /\.(md|mdx|txt)$|^docs?\//i.test(path) ? "docs" : "code";
}

async function gh<T>(args: string[], what: string): Promise<T> {
  try {
    const { stdout } = await run("gh", args, { maxBuffer: 60 * 1024 * 1024 });
    return JSON.parse(stdout) as T;
  } catch (cause) {
    const e = cause as { stderr?: string; message?: string };
    throw new SourceError(`${what} failed: ${(e.stderr || e.message || "").trim().slice(0, 200)}`, { args: args.join(" ") });
  }
}

/**
 * Release notes, following pagination.
 *
 * A fixed `per_page` quietly answers "were we told about this?" with "we did not look far
 * enough". `--paginate` walks the pages; `--slurp` merges them into one array.
 */
export async function releases(repo: string, pages = 4): Promise<ReleaseNote[]> {
  const raw = await gh<Array<{ tag_name: string; published_at: string; name: string; body: string; html_url: string }>>(
    // --slurp merges the pages into one array; it cannot be combined with --jq, so the
    // page cap is applied here instead.
    ["api", "--paginate", "--slurp", `repos/${repo}/releases?per_page=100`],
    `reading releases for ${repo}`,
  );

  const capped = raw.flat().slice(0, pages * 100);

  return capped.map((r) => ({
    tag: r.tag_name,
    published: r.published_at,
    title: r.name || r.tag_name,
    body: r.body ?? "",
    url: r.html_url,
  }));
}

/**
 * What actually changed between two releases, and which of it touches us.
 *
 * `hits` is the point. A diff of 74 files is not information; a diff of 74 files where
 * three of them change the behaviour of `res.send` is.
 */
/**
 * Registry versions and git tags are not the same string.
 *
 * npm says `5.0.0`; expressjs tags it `v5.0.0`; some repos tag `express@5.0.0`. Guessing
 * one and reporting 404 as "no changes" would be the worst outcome, so try the known
 * conventions and only give up once none of them resolve.
 */
const TAG_FORMS = (version: string, pkg: string): string[] => [`v${version}`, version, `${pkg}@${version}`];

export async function compare(
  repo: string,
  base: string,
  head: string,
  symbols: string[],
  pkg = repo.split("/")[1] ?? "",
): Promise<SourceDiff> {
  type Raw = { total_commits: number; html_url: string; files?: Array<{ filename: string; patch?: string }> };

  let raw: Raw | undefined;
  let lastError: unknown;
  outer: for (const b of TAG_FORMS(base, pkg)) {
    for (const h of TAG_FORMS(head, pkg)) {
      try {
        raw = await gh<Raw>(["api", `repos/${repo}/compare/${b}...${h}`], `comparing ${b}...${h} in ${repo}`);
        break outer;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!raw) {
    throw new SourceError(
      `Could not compare ${base}...${head} in ${repo} under any known tag convention — refusing to report "no changes"`,
      { repo, base, head, cause: lastError instanceof Error ? lastError.message : String(lastError) },
    );
  }

  const files = raw.files ?? [];
  const hits: SourceDiff["hits"] = [];

  for (const file of files) {
    for (const symbol of symbols) {
      const lines = (file.patch ?? "")
        .split("\n")
        .filter((l) => (l.startsWith("+") || l.startsWith("-")) && l.includes(symbol))
        .slice(0, 4);

      if (lines.length > 0) hits.push({ file: file.filename, symbol, lines, kind: kindOf(file.filename) });
    }
  }

  // Code first: the reader should meet the behaviour change before the prose about it.
  hits.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "code" ? -1 : 1));

  return {
    base,
    head,
    commits: raw.total_commits,
    filesChanged: files.length,
    // 300 is the documented ceiling. Hitting it exactly is the tell.
    truncated: files.length >= 300,
    hits,
    url: raw.html_url,
  };
}
