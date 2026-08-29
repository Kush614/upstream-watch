/**
 * Typed errors (CLAUDE.md §7). Top-level handlers log these to NOTES.md in demo/dev.
 *
 * Note what is NOT here: there is no "scrape returned nothing" error. A scrape that
 * returns 0 entries or fails validation is a change event, not a failure (CLAUDE.md §6).
 */

export class UpstreamWatchError extends Error {
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
  }
}

/** The vendor page could not be fetched at all. */
export class ScrapeError extends UpstreamWatchError {}

/** agent/targets.yaml or an extraction spec is malformed. */
export class ConfigError extends UpstreamWatchError {}

/** An irreversible action was attempted without `{ approved: true }` (CLAUDE.md §7). */
export class ApprovalRequiredError extends UpstreamWatchError {}
