import { ScrapeError } from "../errors.ts";
import { cacheHtml } from "../lib/cache.ts";
import type { ScraperClient } from "./scraper.ts";
import type { ScrapeResult, VendorTarget } from "../types.ts";

/**
 * Bright Data Web Unlocker client — the live path.
 *
 * Verified against
 * https://docs.brightdata.com/scraping-automation/web-unlocker/send-your-first-request:
 *
 *   POST https://api.brightdata.com/request
 *   Authorization: Bearer $BRIGHTDATA_API_KEY
 *   {"zone": "<zone>", "url": "<target>", "format": "raw"}
 *
 * Config comes from CLAUDE.md §6 — do not ask the user for it.
 */

const DEFAULT_ENDPOINT = "https://api.brightdata.com/request";

/** retry: 3 (CLAUDE.md §6). specs/agent.md: 3 failures ⇒ scrape_failed. */
export const MAX_ATTEMPTS = 3;

export class BrightDataScraperClient implements ScraperClient {
  readonly #apiKey: string;
  readonly #zone: string;
  readonly #endpoint: string;

  constructor(
    apiKey = process.env.BRIGHTDATA_API_KEY ?? "",
    zone = process.env.BRIGHTDATA_ZONE ?? "",
    endpoint = process.env.BRIGHTDATA_ENDPOINT ?? DEFAULT_ENDPOINT,
  ) {
    this.#apiKey = apiKey;
    this.#zone = zone;
    this.#endpoint = endpoint;
  }

  async scrape(target: VendorTarget): Promise<ScrapeResult> {
    if (!this.#apiKey || !this.#zone) {
      throw new ScrapeError(
        "BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE are required for live scraping. " +
          "Set DEMO_MODE=1 to replay the last cached scrape instead.",
        { vendor: target.vendor },
      );
    }

    const html = await this.#fetchWithRetry(target);

    return {
      vendor: target.vendor,
      html,
      provenance: "live",
      // Cache BEFORE anyone parses this (CLAUDE.md §6).
      cachedHtmlPath: await cacheHtml(target.vendor, html),
    };
  }

  async #fetchWithRetry(target: VendorTarget): Promise<string> {
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(this.#endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ zone: this.#zone, url: target.url, format: "raw" }),
        });

        if (res.ok) {
          const body = await res.text();
          if (body.trim().length > 0) return body;
          lastError = "Bright Data returned an empty body";
        } else {
          lastError = `${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`;
        }
      } catch (cause) {
        lastError = String(cause);
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    throw new ScrapeError(`Bright Data scrape failed after ${MAX_ATTEMPTS} attempts`, {
      vendor: target.vendor,
      url: target.url,
      lastError,
    });
  }
}
