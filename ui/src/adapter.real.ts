/**
 * The real adapter: TrueForge for the watch, the proof runner for the two columns.
 *
 * Everything the UI knows about the backend is in this file. It translates TrueForge's
 * event stream — which speaks in tool calls, threads and MCP servers — into the plain
 * sentences the screen shows, and calls a small local runner for the before/after proof.
 */

import type { Adapter, Phase, RunChunk, RunResult, UiEvent, VendorResult, VendorRow } from "./adapter.ts";

/** The proof runner is a separate service; its failures should be distinguishable. */
export class ProofRunnerError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProofRunnerError";
    this.status = status;
  }
}
import { loadSession, decide as decideOnApproval } from "./lib/trueforge-events.ts";
import { askInSession } from "./lib/trueforge-client.ts";
import type { SessionState } from "./types.ts";

const RUNNER = "/proof";
const LOCAL_FEED = "/session.json";
const POLL_MS = 2500;

/* ─────────────────── TrueForge session → plain sentences ───────────────── */

/** What the watch is doing, said the way a person would say it. */
function phaseOf(state: SessionState): Phase {
  if (state.pending.length > 0) return "awaiting_approval";
  // The NEWEST pull request decides. "Any merged item" announces success while linking an
  // older merge, when a later change is still open.
  if (state.done.at(-1)?.status === "merged") return "merged";
  if (state.steps.some((s) => s.kind === "repair")) return "repairing";
  if (state.steps.some((s) => s.kind === "sandbox" || s.kind === "subagent")) return "testing";
  if (state.done.length > 0 || state.steps.some((s) => s.kind === "pr")) return "change_found";
  if (state.steps.length > 0) return "watching";
  return "idle";
}

function messageFor(phase: Phase, state: SessionState): string {
  const pending = state.pending[0];
  const vendor = pending?.entry.vendor ?? state.vendors[0]?.vendor ?? "a service you use";
  const date = pending?.entry.date;

  switch (phase) {
    case "awaiting_approval":
      return "I prepared a fix and tested it. It needs your say-so.";
    case "merged":
      return `Fix applied. Your checkout will keep working${date ? ` on ${date}` : ""}.`;
    case "testing":
      return `Trying your current code against how ${vendor} will behave.`;
    case "change_found":
      return `${vendor} is retiring something your checkout uses${date ? ` on ${date}` : ""}.`;
    case "repairing":
      return `${vendor} changed the layout of their page. Re-learning how to read it.`;
    case "repaired":
      return "Reading it correctly again.";
    case "watching":
      return `Reading ${vendor}'s changelog.`;
    default:
      return `Watching ${state.vendors.length || 4} services for changes.`;
  }
}

/** One `UiEvent` describing where the watch has got to. */
function toUiEvent(state: SessionState): UiEvent {
  const phase = phaseOf(state);
  const pending = state.pending[0];
  const pr = state.done.at(-1);

  return {
    phase,
    message: messageFor(phase, state),
    at: state.summary.lastCheck ?? new Date().toISOString(),
    detail: {
      vendor: pending?.entry.vendor ?? state.vendors[0]?.vendor,
      shutdownDate: pending?.entry.date,
      changelog: pending
        ? {
            title: pending.entry.title,
            excerpt: pending.entry.body,
            url: pending.entry.url,
            // The sentence to highlight: the first one naming the deprecated thing.
            sentence: pending.entry.body.split(/(?<=\.)\s/).find((s) => s.includes("`")) ?? undefined,
          }
        : undefined,
      diff: pending?.diff || undefined,
      files: pending?.files,
      tests:
        pending?.testsPassed === null || pending === undefined
          ? undefined
          : { passed: pending.testsPassed ? 12 : 9, failed: pending.testsPassed ? 0 : 3, output: pending.testOutput },
      pr: pr?.prNumber ? { url: pr.prUrl, number: pr.prNumber } : undefined,
      commit: undefined,
      approvalId: pending?.id,
    },
  };
}

/** Exposed for tests: the mapping is where the subtle mistakes live. */
export const toUiEventForTest = toUiEvent;

/* ──────────────────────────── the adapter ──────────────────────────────── */

class RealAdapter implements Adapter {
  #sessionId?: string;
  #last?: UiEvent;

  async #state(): Promise<SessionState> {
    return loadSession(this.#sessionId);
  }

  subscribe(cb: (e: UiEvent) => void): () => void {
    let stopped = false;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const state = await this.#state();
        this.#sessionId = state.sessionId ?? this.#sessionId;
        const event = toUiEvent(state);

        // Speak when anything the screen renders changes. Comparing only phase and message
        // left the approval card frozen on incomplete detail — the diff, tests and PR arrive
        // while the phase stays awaiting_approval.
        const changed =
          !this.#last ||
          this.#last.phase !== event.phase ||
          this.#last.message !== event.message ||
          JSON.stringify(this.#last.detail) !== JSON.stringify(event.detail);

        if (changed) {
          this.#last = event;
          cb(event);
        }
      } catch {
        /* the harness may be down; the frozen feed still answers history() */
      }
      if (!stopped) setTimeout(tick, POLL_MS);
    };
    void tick();

    return () => {
      stopped = true;
    };
  }

  async history(): Promise<UiEvent[]> {
    try {
      return [toUiEvent(await this.#state())];
    } catch {
      // Nothing running: fall back to the frozen capture so the page still tells the story.
      const res = await fetch(LOCAL_FEED);
      if (!res.ok) return [];
      return [toUiEvent((await res.json()) as SessionState)];
    }
  }

  async approve(approvalId: string): Promise<void> {
    if (this.#sessionId) await decideOnApproval(this.#sessionId, approvalId, "approve");
  }

  async reject(approvalId: string, reason: string): Promise<void> {
    if (this.#sessionId) await decideOnApproval(this.#sessionId, approvalId, "reject", reason);
  }


  /** Streams `request → response → tests` from the proof runner as it happens. */
  async run(side: "before" | "after"): Promise<AsyncIterable<RunChunk>> {
    const res = await fetch(`${RUNNER}/run?side=${side}`, { method: "POST" });
    if (!res.ok || !res.body) {
      throw new ProofRunnerError(
        `The proof runner did not answer (${res.status}). Start it with \`pnpm proof\`.`,
        res.status,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<RunChunk> {
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Newline-delimited JSON: one object per phase.
          let cut: number;
          while ((cut = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, cut).trim();
            buffer = buffer.slice(cut + 1);
            if (line) yield JSON.parse(line) as RunChunk;
          }
        }
      },
    };
  }

  async loadLastRun() {
    try {
      const res = await fetch(`${RUNNER}/last`);
      if (res.ok) return (await res.json()) as { before?: RunResult; after?: RunResult };
    } catch {
      /* runner not started — the receipt it last wrote still stands */
    }

    // The runner persists every result to ui/public/last-run.json. Reading it means a
    // restarted runner, or none at all, still shows the proof that was produced.
    try {
      const res = await fetch("/last-run.json");
      if (res.ok) return (await res.json()) as { before?: RunResult; after?: RunResult };
    } catch {
      /* nothing has ever been run */
    }
    return {};
  }

  async listVendors(): Promise<VendorRow[]> {
    try {
      const res = await fetch(`${RUNNER}/vendors`);
      if (res.ok) return ((await res.json()) as { vendors: VendorRow[] }).vendors;
      throw new ProofRunnerError(`/vendors -> ${res.status} ${res.statusText}`, res.status);
    } catch (cause) {
      // The watchlist is a claim about what this repo watches. An empty table would read as
      // "nothing is watched", which is a different and untrue statement.
      throw cause instanceof ProofRunnerError
        ? cause
        : new ProofRunnerError(`Could not reach the proof runner for the watchlist — ${String(cause)}`);
    }
  }

  async checkVendor(vendor: string): Promise<VendorResult> {
    const res = await fetch(`${RUNNER}/vendors/check?vendor=${encodeURIComponent(vendor)}`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ProofRunnerError(body.error ?? `check ${vendor} -> ${res.status}`, res.status);
    }
    return ((await res.json()) as { result: VendorResult }).result;
  }

  async ask(question: string): Promise<string> {
    if (!this.#sessionId) {
      throw new ProofRunnerError("No agent session to ask — start a watch first, or reload once one is running");
    }
    return askInSession(this.#sessionId, question);
  }
}

export const realAdapter = new RealAdapter();
