import { readFile } from "node:fs/promises";
import { ScrapeError } from "../errors.ts";
import { cacheHtml } from "../lib/cache.ts";
import { fromRepoRoot } from "../lib/paths.ts";
import type { ScraperClient } from "./scraper.ts";
import type { ScrapeResult, WatchTarget } from "../types.ts";

/** Which committed fixture to serve. `pnpm demo:seed` sets this via DEMO_FIXTURE. */
export type FixtureName = "baseline" | "breaking" | "restructured";

/**
 * Serves committed fixtures instead of hitting Bright Data (DEMO_MODE=1, CLAUDE.md §5).
 *
 * Goes through the same cache-then-parse path as the real client, so demo mode exercises
 * the real code path rather than a shortcut around it.
 */
export class FixtureScraperClient implements ScraperClient {
  readonly #fixture: FixtureName;

  constructor(fixture: FixtureName = "baseline") {
    this.#fixture = fixture;
  }

  async scrape(target: WatchTarget): Promise<ScrapeResult> {
    const path = target.fixtures[this.#fixture];

    let html: string;
    try {
      html = await readFile(fromRepoRoot(path), "utf8");
    } catch (cause) {
      throw new ScrapeError(`Fixture not readable: ${path}`, { vendor: target.vendor, cause: String(cause) });
    }

    return {
      vendor: target.vendor,
      html,
      provenance: "fixture",
      cachedHtmlPath: await cacheHtml(target.vendor, html),
    };
  }
}
