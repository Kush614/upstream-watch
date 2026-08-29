import type { ScrapeResult, WatchTarget } from "../types.ts";

/**
 * Every external call goes through a client with a fixture-backed fake (CLAUDE.md §7).
 *
 * Implementations must cache the raw HTML before returning (CLAUDE.md §6) and must
 * report their provenance honestly - the demo says "cached" out loud when it is cached.
 */
export interface ScraperClient {
  scrape(target: WatchTarget): Promise<ScrapeResult>;
}
