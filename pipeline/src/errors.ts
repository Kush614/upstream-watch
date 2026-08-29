/**
 * Typed errors (CLAUDE.md §7). Top-level handlers log these to NOTES.md in demo/dev.
 *
 * Note what is NOT here: there is no "the page changed" error. A scrape that yields no
 * usable entries is a SchemaMismatch change event, not a failure (CLAUDE.md §6).
 */

export class UpstreamWatchError extends Error {
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
  }
}

/** The vendor page could not be fetched at all, after retries. */
export class ScrapeError extends UpstreamWatchError {}

/** targets.yaml, an extraction spec, or the JSON schema is malformed. */
export class ConfigError extends UpstreamWatchError {}

/** An irreversible action was attempted without `{ approved: true }` (CLAUDE.md §7). */
export class ApprovalRequiredError extends UpstreamWatchError {}
