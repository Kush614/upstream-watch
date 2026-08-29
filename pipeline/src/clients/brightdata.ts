import { ScrapeError } from "../errors.ts";
import { cacheHtml } from "../lib/cache.ts";
import type { ScraperClient } from "./scraper.ts";
import type { ScrapeResult, WatchTarget } from "../types.ts";

/**
 * Bright Data scraper client.
 *
 * !! UNVERIFIED !! The request shape below is a placeholder. The working invocation is a
 * preflight task (docs/PLAN.md §3) and must be recorded in CLAUDE.md §6 and
 * skills/brightdata-changelog-scraper/SKILL.md once confirmed. Until then this client
 * fails loudly rather than pretending: DEMO_MODE=1 is the supported path.
 *
 * Config comes from CLAUDE.md §6 - do not ask the user for it.
 */

/** VERIFY against the Bright Data getting-started doc before relying on this. */
const BRIGHTDATA_ENDPOINT = process.env.BRIGHTDATA_ENDPOINT ?? "";

const MAX_ATTEMPTS = 3; // retry: 3 (CLAUDE.md §6)

export class BrightDataScraperClient implements ScraperClient {
  readonly #apiKey: string;
  readonly #zone: string;

  constructor(
    apiKey = process.env.BRIGHTDATA_API_KEY ?? "",
    zone = process.env.BRIGHTDATA_ZONE ?? "",
  ) {
    this.#apiKey = apiKey;
    this.#zone = zone;
  }

  async scrape(target: WatchTarget): Promise<ScrapeResult> {
    if (!this.#apiKey || !this.#zone) {
      throw new ScrapeError(
        "BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE are required for live scraping. " +
          "Set DEMO_MODE=1 to use committed fixtures instead.",
        { vendor: target.vendor },
      );
    }
    if (!BRIGHTDATA_ENDPOINT) {
      throw new ScrapeError(
        "BRIGHTDATA_ENDPOINT is not set. The working Bright Data invocation is still " +
          "unverified - see docs/PLAN.md §3 (preflight) and CLAUDE.md §6.",
        { vendor: target.vendor },
      );
    }

    const html = await this.fetchWithRetry(target);

    return {
      vendor: target.vendor,
      html,
      provenance: "live",
      // Cache BEFORE anyone parses this (CLAUDE.md §6).
      cachedHtmlPath: await cacheHtml(target.vendor, html),
    };
  }

  private async fetchWithRetry(target: WatchTarget): Promise<string> {
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(BRIGHTDATA_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ zone: this.#zone, url: target.url, format: "raw" }),
        });

        if (res.ok) return await res.text();
        lastError = `${res.status} ${res.statusText}`;
      } catch (cause) {
        lastError = String(cause);
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    throw new ScrapeError(`Bright Data scrape failed after ${MAX_ATTEMPTS} attempts`, {
      vendor: target.vendor,
      url: target.url,
      lastError,
    });
  }
}
