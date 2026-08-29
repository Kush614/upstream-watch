import { ScrapeError } from "../errors.ts";
import { currentHtmlPath, readCached } from "../lib/cache.ts";
import type { ScraperClient } from "./scraper.ts";
import type { ScrapeResult, VendorTarget } from "../types.ts";

/**
 * Replays the last cached scrape instead of calling Bright Data (DEMO_MODE=1).
 *
 * This is a fallback and a test seam, not the product: `docs/PLAN.md` keeps cached mode as
 * the "everything on fire" path, and `pnpm demo:break-page` uses it to stage the
 * page-redesign beat. Everything downstream of the fetch is identical to the live path.
 */
export class CachedScraperClient implements ScraperClient {
  readonly #path?: string;

  constructor(path?: string) {
    this.#path = path;
  }

  async scrape(target: VendorTarget): Promise<ScrapeResult> {
    const path = this.#path ?? currentHtmlPath(target.vendor);
    const html = await readCached(path);

    if (html === null) {
      throw new ScrapeError(
        `No cached HTML at ${path}. Run a live scrape first, or unset DEMO_MODE.`,
        { vendor: target.vendor },
      );
    }

    return { vendor: target.vendor, html, provenance: "cache", cachedHtmlPath: path };
  }
}
