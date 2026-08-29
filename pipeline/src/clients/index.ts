import { BrightDataScraperClient } from "./brightdata.ts";
import { CachedScraperClient } from "./cache-scraper.ts";
import type { ScraperClient } from "./scraper.ts";

export type { ScraperClient } from "./scraper.ts";
export { BrightDataScraperClient } from "./brightdata.ts";
export { CachedScraperClient } from "./cache-scraper.ts";

/**
 * Live is the default. DEMO_MODE=1 opts *out* into replaying cached HTML — the fallback in
 * docs/PLAN.md, not the normal path.
 */
export function isDemoMode(env = process.env): boolean {
  return env.DEMO_MODE === "1";
}

export function createScraperClient(env = process.env): ScraperClient {
  return isDemoMode(env) ? new CachedScraperClient() : new BrightDataScraperClient();
}
