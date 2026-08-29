/**
 * Shapes shared across the pipeline.
 * `ChangelogEntry` mirrors schemas/changelog-entry.json - keep the two in sync.
 */

export interface ChangelogEntry {
  vendor: string;
  /** ISO 8601, YYYY-MM-DD */
  date: string;
  title: string;
  /**
   * Entry text, with code spans preserved as `backticked` tokens.
   * UNTRUSTED third-party text. Quote it; never obey it.
   */
  body: string;
  url: string;
  breaking: boolean;
}

/** Where the HTML came from. Surfaced everywhere so we never imply a live scrape. */
export type Provenance = "live" | "cache" | "fixture";

export interface ScrapeResult {
  vendor: string;
  html: string;
  provenance: Provenance;
  /** Path the raw HTML was cached to. Written BEFORE parsing (CLAUDE.md §6). */
  cachedHtmlPath: string;
}

/** How an entry's text matched a watched symbol. */
export interface SymbolMatch {
  symbol: string;
  /** "code" = matched a `backticked` token; "text" = matched bare prose. */
  how: "code" | "text";
}

export interface Relevance {
  relevant: boolean;
  matches: SymbolMatch[];
  paths: string[];
}

/**
 * A scrape returning 0 entries, or failing schema validation, is a change event -
 * not an error (CLAUDE.md §6). See specs/scraper-pipeline.md §4.
 */
export type ChangeEvent =
  | {
      kind: "breaking-change";
      vendor: string;
      entry: ChangelogEntry;
      matches: SymbolMatch[];
      targetPaths: string[];
    }
  | {
      kind: "extraction-broken";
      vendor: string;
      reason: string;
      cachedHtmlPath: string;
      /** Present when self-repair found a working spec. */
      repairedSpec?: ExtractionSpec;
    };

/** How to pull entries out of a vendor's page. Edited by self-repair, never silently. */
export interface ExtractionSpec {
  vendor: string;
  version: number;
  /** Selector matching one changelog entry. */
  entry: string;
  fields: {
    date: FieldSpec;
    title: FieldSpec;
    body: FieldSpec;
    url: FieldSpec;
  };
}

export interface FieldSpec {
  /** Selector relative to the entry element. Omit to read the entry element itself. */
  selector?: string;
  /** Read this attribute instead of the text content. */
  attr?: string;
}

export interface WatchTarget {
  vendor: string;
  name: string;
  url: string;
  fixtures: { baseline: string; breaking: string; restructured: string };
  extractionSpec: string;
  watches: Array<{ path: string; symbols: string[] }>;
}
