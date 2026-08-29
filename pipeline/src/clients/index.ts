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

/**
 * Pick the scraper for a target.
 *
 * Live by default. A vendor pinned to `cache` in targets.yaml, or DEMO_MODE=1 globally,
 * replays its committed capture instead.
 */
export function createScraperClient(
  target?: { source?: "live" | "cache" },
  env = process.env,
): ScraperClient {
  const cached = isDemoMode(env) || target?.source === "cache";
  return cached ? new CachedScraperClient() : new BrightDataScraperClient();
}
