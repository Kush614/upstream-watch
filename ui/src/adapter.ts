/**
 * The only coupling between this UI and the backend.
 *
 * Everything the screen renders arrives through `Adapter`. Nothing else in `ui/` imports
 * from `pipeline/` or talks to TrueForge — swap the implementation and the UI is unchanged.
 * `adapter.mock.ts` implements the same interface with a scripted timeline so the UI can be
 * built and rehearsed with no backend running.
 */

export type Phase =
  | "idle"
  | "watching"
  | "change_found"
  | "testing"
  | "awaiting_approval"
  | "merged"
  | "repairing"
  | "repaired"
  | "error";

export interface UiEvent {
  phase: Phase;
  /** Plain English, already humanised. The UI never rewrites this. */
  message: string;
  at: string;
  detail?: {
    vendor?: string;
    /** YYYY-MM-DD */
    shutdownDate?: string;
    changelog?: { title: string; excerpt: string; url: string; sentence?: string };
    diff?: string;
    files?: string[];
    tests?: { passed: number; failed: number; output?: string };
    pr?: { url: string; number: number };
    review?: { url: string };
    commit?: { sha: string; url: string };
    approvalId?: string;
  };
}

export interface RunResult {
  side: "before" | "after";
  sha: string;
  request: unknown;
  /** Key to highlight in the request body — the one the vendor removed. */
  changedKey?: string;
  status: number;
  responseExcerpt: string;
  tests: { passed: number; failed: number; output: string };
  citations: Citation[];
  at: string;
}

/**
 * A claim on screen, and the thing that backs it.
 *
 * The columns assert something consequential — that your service breaks, that this fix
 * repairs it. A reader who cannot check that is being asked to take it on faith, which is
 * the opposite of the point. Every citation is read back from real evidence.
 */
export interface Citation {
  claim: string;
  evidence: string;
  source: string;
  url?: string;
}

/**
 * A watched open-source dependency.
 *
 * Mirrors `PackageFinding` in scripts/oss-check.ts. Three sources per package, kept
 * separate rather than merged into a verdict, because where they disagree IS the finding.
 */
export interface PackageFinding {
  package: string;
  repo: string;
  pinned: string;
  latest: string;
  majorsBehind: number;
  daysSincePinned: number | null;
  /** When the first major above the pin shipped — the day the break became reachable. */
  breakAvailableSince: string | null;
  /** `silent` means the old call still works and now means something else. */
  severity: "silent" | "loud";
  announced: Array<{ tag: string; url: string; quote: string }>;
  inSource: Array<{ file: string; symbol: string; lines: string[]; kind: "code" | "docs" }>;
  compareUrl?: string;
  commits?: number;
  filesChanged?: number;
  files: string[];
  symbols?: string[];
}

/** One vendor on the watchlist, and what the last look at it found. */
export interface VendorRow {
  vendor: string;
  url: string;
  source: "live" | "cache";
  pinnedBecause?: string;
  symbols: string[];
  files: string[];
  lastCheck: string | null;
  entriesSeen: number;
  /** Set when persisted state exists but could not be read — never shown as "never". */
  stateError?: string;
  result?: VendorResult;
}

export interface VendorResult {
  entries: number;
  matches: Array<{ date: string; title: string; url: string; relevance: string; files: string[] }>;
  breakingElsewhere: number;
  failed?: string;
  at: string;
}

export type RunChunk =
  | { phase: "request"; data: unknown }
  | { phase: "response"; data: { status: number; excerpt: string } }
  | { phase: "tests"; data: { passed: number; failed: number; output: string } }
  | { phase: "citations"; data: Citation[] };

export interface Adapter {
  subscribe(cb: (e: UiEvent) => void): () => void;
  history(): Promise<UiEvent[]>;
  approve(approvalId: string): Promise<void>;
  reject(approvalId: string, reason: string): Promise<void>;
  run(side: "before" | "after"): Promise<AsyncIterable<RunChunk>>;
  loadLastRun(): Promise<{ before?: RunResult; after?: RunResult }>;

  /** Everything this repo watches, not just the vendor the columns happen to be about. */
  listVendors(): Promise<VendorRow[]>;
  /** Check one vendor for real. Never consumes state the agent still has to find. */
  checkVendor(vendor: string): Promise<VendorResult>;

  /** Every watched dependency, read from its registry, its releases and its source. */
  listPackages(): Promise<PackageFinding[]>;

  /**
   * Whether there is a live agent session to talk to *right now*.
   *
   * Not "are there events on screen": offline the events come from a frozen capture, and
   * enabling the composer against those offers a conversation that cannot happen.
   */
  hasLiveSession(): boolean;
  /** Ask the running agent a question, in its own session. */
  ask(question: string): Promise<string>;
}

/* ────────────────────────── shared helpers ─────────────────────────────── */

/**
 * Whole days since `date`, floored at 0.
 *
 * The shutdown this page proves has already happened, so the honest phrasing is "N days
 * ago", not a countdown. Nothing here emulates a date any more.
 */
export function daysAgo(date: string, from = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.max(0, Math.round((start - target) / 86_400_000));
}

/** The phase a run of events has reached — the UI keys every animation off this. */
export function currentPhase(events: UiEvent[]): Phase {
  return events.at(-1)?.phase ?? "idle";
}

/** Merge detail from the whole history: later events refine, never erase. */
export function mergedDetail(events: UiEvent[]): NonNullable<UiEvent["detail"]> {
  const out: Record<string, unknown> = {};
  for (const e of events) {
    for (const [k, v] of Object.entries(e.detail ?? {})) {
      if (v !== undefined && v !== null) out[k] = v;
    }
  }
  return out as NonNullable<UiEvent["detail"]>;
}

/**
 * A vendor could not be looked up.
 *
 * Typed because the caller has to tell "you asked for a vendor we do not watch" apart from
 * "the runner is unreachable" — the first is a bug in the page, the second is a fact about
 * the world, and they deserve different words on screen.
 */
export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
}
