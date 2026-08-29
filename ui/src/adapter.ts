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
  at: string;
}

export type RunChunk =
  | { phase: "request"; data: unknown }
  | { phase: "response"; data: { status: number; excerpt: string } }
  | { phase: "tests"; data: { passed: number; failed: number; output: string } };

export interface Adapter {
  subscribe(cb: (e: UiEvent) => void): () => void;
  history(): Promise<UiEvent[]>;
  approve(approvalId: string): Promise<void>;
  reject(approvalId: string, reason: string): Promise<void>;
  run(side: "before" | "after"): Promise<AsyncIterable<RunChunk>>;
  loadLastRun(): Promise<{ before?: RunResult; after?: RunResult }>;
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
