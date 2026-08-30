/**
 * Every vendor this repo watches, and what the last look at each one actually found.
 *
 * The proof columns tell one vendor's story in depth. This answers the other question a
 * reader has — *what about everything else you claim to watch?* — and it answers it with
 * real state on disk plus, on request, a real scrape.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadTargets } from "../../pipeline/src/lib/targets.ts";
import type { ChangeEvent } from "../../pipeline/src/types.ts";

const run = promisify(execFile);

/** Raised when a vendor check cannot be trusted, rather than reported as "nothing found". */
export class WatchlistError extends Error {
  readonly context: Record<string, unknown>;
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "WatchlistError";
    this.context = context;
  }
}

export interface VendorRow {
  vendor: string;
  url: string;
  /** Live scrape, or pinned to a committed capture. Never inferred — read from targets.yaml. */
  source: "live" | "cache";
  /** Why this vendor is pinned, when it is. */
  pinnedBecause?: string;
  symbols: string[];
  files: string[];
  lastCheck: string | null;
  entriesSeen: number;
  /** Set when the persisted state exists but could not be read. Never conflated with "never". */
  stateError?: string;
  /** Filled in only by an actual check. Absent means "not looked at this session". */
  result?: VendorResult;
}

export interface VendorResult {
  entries: number;
  matches: Array<{ date: string; title: string; url: string; relevance: string; files: string[] }>;
  breakingElsewhere: number;
  failed?: string;
  at: string;
}

/** Bright Data's compliance refusal is the only pin we have, and it is worth naming. */
const PIN_REASON: Record<string, string> = {
  stripe: "Bright Data refuses docs.stripe.com (policy_20050 — payments domains are KYC-gated), so this vendor is watched from a committed real capture.",
};

export async function rows(root: string): Promise<VendorRow[]> {
  const targets = await loadTargets(join(root, "agent/targets.yaml"));

  return Promise.all(
    targets.vendors.map(async (v) => {
      let lastCheck: string | null = null;
      let entriesSeen = 0;
      let stateError: string | undefined;
      try {
        const state = JSON.parse(
          await readFile(join(root, `pipeline/state/${v.vendor}.last.json`), "utf8"),
        ) as { lastCheck?: string; seen?: unknown[] };
        lastCheck = state.lastCheck ?? null;
        entriesSeen = state.seen?.length ?? 0;
      } catch (cause) {
        // "Never checked" and "the record of the check is unreadable" look identical in a
        // table and mean opposite things — one is honest coverage, the other is a broken
        // watchlist wearing an innocent face. Only a missing file is the innocent one.
        if ((cause as NodeJS.ErrnoException)?.code !== "ENOENT") {
          stateError = `state file unreadable — ${cause instanceof Error ? cause.message : String(cause)}`;
        }
      }

      return {
        vendor: v.vendor,
        url: v.url,
        source: v.source ?? "live",
        pinnedBecause: v.source === "cache" ? PIN_REASON[v.vendor] : undefined,
        symbols: v.symbols,
        files: v.files,
        lastCheck,
        entriesSeen,
        stateError,
      };
    }),
  );
}

/**
 * Check one vendor for real.
 *
 * Runs with `--no-persist`, so looking at the watchlist never consumes the entries the
 * agent still has to find — the exact mistake that has cost this project a demo run twice.
 */
export async function check(root: string, vendor: string): Promise<VendorResult> {
  const known = await rows(root);
  if (!known.some((r) => r.vendor === vendor)) {
    throw new WatchlistError(`${vendor} is not in agent/targets.yaml`, { vendor });
  }

  let stdout: string;
  try {
    ({ stdout } = await run("pnpm", ["scrape", "--vendor", vendor, "--", "--no-persist"], {
      cwd: root,
      maxBuffer: 40 * 1024 * 1024,
    }));
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    // A scrape that fails is a real answer about this vendor, not a blank row.
    return {
      entries: 0,
      matches: [],
      breakingElsewhere: 0,
      failed: (e.stderr || e.stdout || "scrape failed").trim().split("\n").slice(-3).join(" "),
      at: new Date().toISOString(),
    };
  }

  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new WatchlistError("Scrape produced no JSON array — cannot report this as zero findings", {
      vendor,
      tail: stdout.trim().split("\n").slice(-5).join("\n"),
    });
  }

  const events = JSON.parse(stdout.slice(start, end + 1)) as ChangeEvent[];
  const changes = events.filter((e): e is Extract<ChangeEvent, { type: "change" }> => e.type === "change");

  return {
    entries: events.length,
    matches: changes
      .filter((c) => c.relevance === "symbol-match")
      .map((c) => ({
        date: c.entry.date,
        title: c.entry.title,
        url: c.entry.url,
        relevance: c.relevance,
        files: c.files,
      })),
    breakingElsewhere: changes.filter((c) => c.relevance === "breaking-only").length,
    at: new Date().toISOString(),
  };
}
