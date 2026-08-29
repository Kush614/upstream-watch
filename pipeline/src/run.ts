import { createScraperClient, type ScraperClient } from "./clients/index.ts";
import { loadExtractionSpec } from "./lib/extraction-spec.ts";
import { extractEntries } from "./lib/parse.ts";
import { validateEntries } from "./lib/validate.ts";
import { withClassification } from "./lib/classify.ts";
import { assessRelevance } from "./lib/relevance.ts";
import { diffEntries } from "./lib/diff.ts";
import { loadState, markSeen, saveState, type State } from "./lib/state.ts";
import { loadTargets } from "./lib/targets.ts";
import { proposeExtractionSpec, type RepairProposal } from "./lib/repair.ts";
import type { ChangeEvent, ChangelogEntry, Provenance, WatchTarget } from "./types.ts";

/** One repair attempt per target per run (specs/scraper-pipeline.md §4). */
const MAX_REPAIRS_PER_RUN = 1;

export interface VendorReport {
  vendor: string;
  provenance: Provenance;
  cachedHtmlPath: string;
  entriesFound: number;
  /** New since the last run. */
  added: number;
  /** Breaking, but matching nothing we call: recorded, not acted on. */
  ignoredBreaking: ChangelogEntry[];
  events: ChangeEvent[];
  firstRun: boolean;
  repair?: RepairProposal;
}

export interface RunOptions {
  client?: ScraperClient;
  /** Skip persisting last-seen state. Tests and dry runs use this. */
  persist?: boolean;
  targetsFile?: string;
  stateFile?: string;
}

export interface RunReport {
  vendors: VendorReport[];
  events: ChangeEvent[];
}

async function runTarget(
  target: WatchTarget,
  client: ScraperClient,
  state: State,
): Promise<{ report: VendorReport; entries: ChangelogEntry[] }> {
  // scrape -> cache (inside the client) -> parse. Never parse uncached (CLAUDE.md §6).
  const scrape = await client.scrape(target);
  const spec = await loadExtractionSpec(target.extractionSpec);

  // Entry permalinks are resolved against the page they came from, so relative hrefs
  // survive schema validation.
  const extracted = extractEntries(scrape.html, spec, target.url).map(withClassification);
  const { valid, invalid } = validateEntries(extracted);

  const base: VendorReport = {
    vendor: target.vendor,
    provenance: scrape.provenance,
    cachedHtmlPath: scrape.cachedHtmlPath,
    entriesFound: valid.length,
    added: 0,
    ignoredBreaking: [],
    events: [],
    firstRun: false,
  };

  // 0 entries, or nothing surviving validation, means the vendor changed their page.
  // That is a change event, not an error (CLAUDE.md §6).
  if (valid.length === 0) {
    const reason =
      extracted.length === 0
        ? `Entry selector "${spec.entry}" matched no elements.`
        : `All ${extracted.length} extracted entries failed schema validation: ${invalid[0]?.errors ?? ""}`;

    const repair =
      MAX_REPAIRS_PER_RUN > 0
        ? (proposeExtractionSpec(scrape.html, spec) ?? undefined)
        : undefined;

    return {
      entries: [],
      report: {
        ...base,
        repair,
        events: [
          {
            kind: "extraction-broken",
            vendor: target.vendor,
            reason,
            cachedHtmlPath: scrape.cachedHtmlPath,
            partial: false,
            ...(repair ? { repairedSpec: repair.spec } : {}),
          },
        ],
      },
    };
  }

  const events: ChangeEvent[] = [];

  // Some entries validated and some did not. Continuing on the valid ones alone would
  // silently drop the invalid ones - and a newly added breaking entry is exactly the kind
  // of thing that is malformed first, so it could stay invisible forever. Surface it, then
  // carry on with what we can read.
  if (invalid.length > 0) {
    const better = proposeExtractionSpec(scrape.html, spec) ?? undefined;
    const repair = better && better.validEntries > valid.length ? better : undefined;

    events.push({
      kind: "extraction-broken",
      vendor: target.vendor,
      reason:
        `${invalid.length} of ${extracted.length} entries failed schema validation ` +
        `(continuing on the ${valid.length} that passed): ${invalid[0]?.errors ?? ""}`,
      cachedHtmlPath: scrape.cachedHtmlPath,
      partial: true,
      ...(repair ? { repairedSpec: repair.spec } : {}),
    });
  }

  const { added, firstRun } = diffEntries(valid, state, target.vendor);

  // On a first run everything looks new. Baseline silently rather than reporting the
  // vendor's whole backlog as breaking news (specs/agent.md §The loop, step 2).
  if (firstRun) {
    return {
      entries: valid,
      report: { ...base, added: added.length, firstRun: true, events },
    };
  }

  const ignoredBreaking: ChangelogEntry[] = [];

  for (const entry of added) {
    if (!entry.breaking) continue;

    const relevance = assessRelevance(entry, target);
    if (!relevance.relevant) {
      ignoredBreaking.push(entry);
      continue;
    }

    events.push({
      kind: "breaking-change",
      vendor: target.vendor,
      entry,
      matches: relevance.matches,
      targetPaths: relevance.paths,
    });
  }

  return { entries: valid, report: { ...base, added: added.length, ignoredBreaking, events } };
}

/**
 * One pass over every watched target.
 *
 * Pure with respect to the outside world apart from the cache write and the state file,
 * so it can be driven from tests with a fixture client and no network (CLAUDE.md §7).
 */
export async function run(options: RunOptions = {}): Promise<RunReport> {
  const client = options.client ?? createScraperClient();
  const targets = await loadTargets(options.targetsFile);

  let state = await loadState(options.stateFile);
  const vendors: VendorReport[] = [];

  for (const target of targets) {
    const { report, entries } = await runTarget(target, client, state);
    vendors.push(report);

    if (entries.length > 0) {
      state = markSeen(state, target.vendor, entries);

      // Persist per target rather than once at the end: if a later target throws, the
      // work already done stays recorded instead of being replayed as new next run.
      if (options.persist !== false) {
        await saveState(state, options.stateFile);
      }
    }
  }

  return { vendors, events: vendors.flatMap((v) => v.events) };
}
