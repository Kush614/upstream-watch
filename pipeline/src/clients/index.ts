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

/** Live scraping needs both of these; without them there is nothing to try. */
export function hasLiveCredentials(env = process.env): boolean {
  return Boolean(env.BRIGHTDATA_API_KEY && env.BRIGHTDATA_ZONE);
}

/**
 * Pick the scraper for a target.
 *
 * Live by default. Falls back to the committed capture when the vendor is pinned to
 * `cache`, when DEMO_MODE=1, or when there are no Bright Data credentials at all.
 *
 * That last case is deliberate and deterministic. The agent's sandbox clones this repo
 * from GitHub, and `.env` is gitignored — so credentials are simply absent there. Left to
 * fail, a watcher subagent either improvises a DEMO_MODE retry or reports the whole vendor
 * as broken, and which one you get varies run to run. Falling back in code makes it the
 * same every time, and `provenance` still says `cache` in the CLI output and the PR body,
 * so nothing claims to be live that is not.
 */
export function createScraperClient(
  target?: { source?: "live" | "cache" },
  env = process.env,
): ScraperClient {
  const cached = isDemoMode(env) || target?.source === "cache" || !hasLiveCredentials(env);
  return cached ? new CachedScraperClient() : new BrightDataScraperClient();
}
