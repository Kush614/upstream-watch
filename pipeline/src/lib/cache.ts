import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "./paths.ts";

/** cache_dir from CLAUDE.md §6, per vendor per specs/scraper-pipeline.md §2. */
const CACHE_ROOT = "agent/fixtures/html";

/** specs/scraper-pipeline.md §2: "Keep last 5". */
const KEEP = 5;

export function vendorCacheDir(vendor: string): string {
  return `${CACHE_ROOT}/${vendor}`;
}

/** The snapshot DEMO_MODE serves, and the one demo:break-page swaps. */
export function currentHtmlPath(vendor: string): string {
  return `${vendorCacheDir(vendor)}/current.html`;
}

/**
 * Snapshots are the timestamped files a scrape writes. `current.html`, `last-good.html`
 * and the hand-made `restructured.html` demo prop all live in the same directory and must
 * never be mistaken for one.
 */
function isSnapshot(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T[\d-]+Z?\.html$/.test(name);
}

/**
 * Write raw HTML to the vendor's cache and return its repo-relative path.
 *
 * "Every scrape writes raw HTML to cache_dir before parsing. Never parse without caching."
 * (CLAUDE.md §6). The cache is what makes self-repair possible — it lets repair iterate
 * offline against the exact bytes that broke — and what makes a run reproducible.
 */
export async function cacheHtml(vendor: string, html: string): Promise<string> {
  const dir = vendorCacheDir(vendor);
  await mkdir(fromRepoRoot(dir), { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = `${dir}/${stamp}.html`;

  await writeFile(fromRepoRoot(relative), html, "utf8");
  // `current.html` always points at the newest scrape, so DEMO_MODE replays the last run.
  await writeFile(fromRepoRoot(currentHtmlPath(vendor)), html, "utf8");
  await prune(vendor);

  return relative;
}

/** Keep only the newest KEEP timestamped snapshots. */
async function prune(vendor: string): Promise<void> {
  const dir = fromRepoRoot(vendorCacheDir(vendor));
  const snapshots = (await readdir(dir)).filter(isSnapshot).sort();

  for (const stale of snapshots.slice(0, Math.max(0, snapshots.length - KEEP))) {
    await rm(join(dir, stale), { force: true });
  }
}

/** The newest cached snapshot, or null when the vendor has never been scraped. */
export async function newestSnapshot(vendor: string): Promise<string | null> {
  try {
    const dir = vendorCacheDir(vendor);
    const snapshots = (await readdir(fromRepoRoot(dir))).filter(isSnapshot).sort();
    const newest = snapshots.at(-1);
    return newest ? `${dir}/${newest}` : null;
  } catch {
    return null;
  }
}

/**
 * The last HTML that parsed cleanly. Repair needs it for the regression check in
 * specs/scraper-pipeline.md §4.3.
 */
export function lastGoodPath(vendor: string): string {
  return `${vendorCacheDir(vendor)}/last-good.html`;
}

export async function markLastGood(vendor: string, html: string): Promise<void> {
  await mkdir(fromRepoRoot(vendorCacheDir(vendor)), { recursive: true });
  await writeFile(fromRepoRoot(lastGoodPath(vendor)), html, "utf8");
}

export async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(fromRepoRoot(path), "utf8");
  } catch {
    return null;
  }
}
