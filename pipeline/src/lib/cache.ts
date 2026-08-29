import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromRepoRoot } from "./paths.ts";

/** cache_dir from CLAUDE.md §6. */
const CACHE_DIR = "agent/fixtures/html";

/**
 * Write raw HTML to the cache and return its repo-relative path.
 *
 * "Every scrape writes raw HTML to cache_dir before parsing. Never parse without
 * caching." (CLAUDE.md §6). The cache is what makes self-repair possible - it lets the
 * repair loop iterate offline against the exact bytes that broke - and what makes the
 * demo reproducible.
 *
 * Filenames carry a `-scrape-` marker so they are gitignored and never confused with
 * the committed fixtures sitting in the same directory.
 */
export async function cacheHtml(vendor: string, html: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = join(CACHE_DIR, `${vendor}-scrape-${stamp}.html`);

  await mkdir(fromRepoRoot(CACHE_DIR), { recursive: true });
  await writeFile(fromRepoRoot(relative), html, "utf8");

  return relative;
}
