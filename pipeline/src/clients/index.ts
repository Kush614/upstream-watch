import { BrightDataScraperClient } from "./brightdata.ts";
import { FixtureScraperClient, type FixtureName } from "./fixture-scraper.ts";
import type { ScraperClient } from "./scraper.ts";

export type { ScraperClient } from "./scraper.ts";
export { BrightDataScraperClient } from "./brightdata.ts";
export { FixtureScraperClient } from "./fixture-scraper.ts";

export function isDemoMode(env = process.env): boolean {
  return env.DEMO_MODE === "1";
}

/** Pick the scraper for the current environment (CLAUDE.md §5). */
export function createScraperClient(env = process.env): ScraperClient {
  if (isDemoMode(env)) {
    return new FixtureScraperClient((env.DEMO_FIXTURE as FixtureName) ?? "baseline");
  }
  return new BrightDataScraperClient();
}
