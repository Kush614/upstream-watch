/**
 * A scripted timeline implementing the same `Adapter` interface as the real one.
 *
 * Enabled with `?demo=1`; `&auto=1` advances on its own. The footer's "Next state" button
 * steps it by hand, so the whole screen can be built and rehearsed with no backend running.
 *
 * The payload is REAL captured data — the actual OpenAI deprecation, the actual 26-line diff
 * the patcher produced, the actual pull request — so the mock and the wired adapter show the
 * same thing and cannot drift apart.
 */

import type { Adapter, RunChunk, RunResult, UiEvent } from "./adapter.ts";

const VENDOR = "openai";
const SHUTDOWN = "2026-12-11";
const OLD_MODEL = "gpt-5-mini-2025-08-07";
const NEW_MODEL = "gpt-5.6-terra";

const CHANGELOG = {
  title: "`gpt-5-mini-2025-08-07`",
  excerpt: "Dec 11, 2026 `gpt-5-mini-2025-08-07` \u2192 `gpt-5.6-terra`",
  url: "https://platform.openai.com/docs/deprecations",
  sentence: "`" + OLD_MODEL + "` is scheduled for shutdown on " + SHUTDOWN + ".",
};

const DIFF = "diff --git a/demo-app/src/risk.ts b/demo-app/src/risk.ts\nindex 050d969..00525b1 100644\n--- a/demo-app/src/risk.ts\n+++ b/demo-app/src/risk.ts\n@@ -9,7 +9,7 @@\n const OPENAI_API = process.env.OPENAI_API_BASE ?? \"https://api.openai.com/v1\";\n \n /** Pinned deliberately. OpenAI's deprecations page lists a shutdown date for this. */\n-export const RISK_MODEL = \"gpt-5-mini-2025-08-07\";\n+export const RISK_MODEL = \"gpt-5.6-terra\";\n \n export interface RiskRequest {\n   amountCents: number;\ndiff --git a/demo-app/test/vendors.test.ts b/demo-app/test/vendors.test.ts\nindex 330ec35..b3eeb17 100644\n--- a/demo-app/test/vendors.test.ts\n+++ b/demo-app/test/vendors.test.ts\n@@ -6,7 +6,7 @@ describe(\"OpenAI risk check\", () => {\n   it(\"uses the model this service is pinned to\", () => {\n     // Pinned deliberately: OpenAI publishes a shutdown date for this model, so when the\n     // deprecation lands this assertion is what has to change alongside the call.\n-    expect(RISK_MODEL).toBe(\"gpt-5-mini-2025-08-07\");\n+    expect(RISK_MODEL).toBe(\"gpt-5.6-terra\");\n   });\n \n   it(\"builds a prompt carrying the facts a reviewer needs\", () => {\n";
const FILES = ["demo-app/src/risk.ts", "demo-app/test/vendors.test.ts"];
const TEST_OUTPUT = "export PATH=/opt/node/bin:$PATH; pnpm --filter demo-app typecheck && pnpm --filter demo-app test: passed (tsc --noEmit; vitest run: 3 files, 20 tests passed)";
const PR = { url: "https://github.com/Kush614/upstream-watch/pull/6", number: 6 };

const BEFORE_SHA = "8f30a58";
const AFTER_SHA = "0d3914d";

/** The scripted states, in order. Each is one `UiEvent`. */
export const TIMELINE: UiEvent[] = [
  { phase: "idle", message: "Watching 4 services for changes.", at: "", detail: { vendor: VENDOR } },
  { phase: "watching", message: "Reading " + VENDOR + "'s deprecations page.", at: "", detail: { vendor: VENDOR } },
  {
    phase: "change_found",
    message: VENDOR + " is retiring something your checkout uses on " + SHUTDOWN + ".",
    at: "",
    detail: { vendor: VENDOR, shutdownDate: SHUTDOWN, changelog: CHANGELOG, files: FILES },
  },
  {
    phase: "testing",
    message: "Trying your current code against how " + VENDOR + " will behave that day.",
    at: "",
    detail: { vendor: VENDOR, shutdownDate: SHUTDOWN, changelog: CHANGELOG, files: FILES },
  },
  {
    phase: "awaiting_approval",
    message: "I prepared a fix and tested it. It needs your say-so.",
    at: "",
    detail: {
      vendor: VENDOR, shutdownDate: SHUTDOWN, changelog: CHANGELOG, files: FILES,
      diff: DIFF, tests: { passed: 12, failed: 0, output: TEST_OUTPUT },
      pr: PR, approvalId: "mock-approval-1",
    },
  },
  {
    phase: "merged",
    message: "Fix applied. Your checkout will keep working on " + SHUTDOWN + ".",
    at: "",
    detail: {
      vendor: VENDOR, shutdownDate: SHUTDOWN, changelog: CHANGELOG, files: FILES,
      diff: DIFF, tests: { passed: 12, failed: 0, output: TEST_OUTPUT }, pr: PR,
      review: { url: PR.url + "#pullrequestreview" },
      commit: { sha: AFTER_SHA, url: "https://github.com/Kush614/upstream-watch/commit/" + AFTER_SHA },
    },
  },
  {
    phase: "repairing",
    message: VENDOR + " changed the layout of their page. Re-learning how to read it.",
    at: "",
    detail: { vendor: VENDOR, changelog: CHANGELOG },
  },
  {
    phase: "repaired",
    message: "Reading it correctly again. The change to how it reads is up for review too.",
    at: "",
    detail: { vendor: VENDOR, changelog: CHANGELOG, pr: { url: PR.url, number: 6 } },
  },
];

function requestFor(side: "before" | "after") {
  return {
    model: side === "before" ? OLD_MODEL : NEW_MODEL,
    input: "Assess fraud risk for a card payment...",
    store: false,
  };
}

const FAIL_BODY =
  "The model `" + OLD_MODEL + "` has been shut down.\n" +
  "Learn more: https://platform.openai.com/docs/deprecations\n" +
  "Use `" + NEW_MODEL + "` instead.";

const OK_BODY = '{ "id": "resp_1", "output_text": "low — small amount, familiar country" }';

function resultFor(side: "before" | "after", emulatedDate: string): RunResult {
  const broken = side === "before" && emulatedDate >= SHUTDOWN;
  return {
    side,
    sha: side === "before" ? BEFORE_SHA : AFTER_SHA,
    request: requestFor(side),
    changedKey: "model",
    status: broken ? 400 : 200,
    responseExcerpt: broken ? FAIL_BODY : OK_BODY,
    tests: broken
      ? { passed: 9, failed: 3, output: "FAIL demo-app/test/vendors.test.ts\n  x uses the model this service is pinned to\n  x POST /payments returns 201\n  x risk level is parsed\n\n  9 passed | 3 failed" }
      : { passed: 12, failed: 0, output: TEST_OUTPUT || "  12 passed (12)" },
    emulatedDate,
    at: new Date().toISOString(),
  };
}

const STORE_KEY = "upstream-watch.mock";

interface MockState { step: number; emulatedDate: string; before?: RunResult; after?: RunResult }

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* private mode, cleared storage — a fresh start is correct */
  }
  return { step: 0, emulatedDate: SHUTDOWN };
}

function save(state: MockState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* refresh restore is a convenience, never a requirement */
  }
}

export class MockAdapter implements Adapter {
  #state = load();
  #listeners = new Set<(e: UiEvent) => void>();

  /** Footer "Next state" button, and the auto-advance timer. */
  advance(): void {
    this.#state.step = Math.min(this.#state.step + 1, TIMELINE.length - 1);

    // Reaching the tested state fills both columns, as a real run would.
    if (this.#state.step >= 3) {
      this.#state.before = resultFor("before", this.#state.emulatedDate);
      this.#state.after = resultFor("after", this.#state.emulatedDate);
    }
    save(this.#state);
    this.#emit();
  }

  reset(): void {
    this.#state = { step: 0, emulatedDate: SHUTDOWN };
    save(this.#state);
    this.#emit();
  }

  get step(): number {
    return this.#state.step;
  }

  #current(): UiEvent {
    const e = TIMELINE[this.#state.step] ?? TIMELINE[0]!;
    return { ...e, at: new Date().toISOString() };
  }

  #emit(): void {
    const e = this.#current();
    for (const cb of this.#listeners) cb(e);
  }

  subscribe(cb: (e: UiEvent) => void): () => void {
    this.#listeners.add(cb);
    cb(this.#current());
    return () => this.#listeners.delete(cb);
  }

  async history(): Promise<UiEvent[]> {
    return TIMELINE.slice(0, this.#state.step + 1).map((e) => ({ ...e, at: new Date().toISOString() }));
  }

  async approve(): Promise<void> {
    this.#state.step = TIMELINE.findIndex((e) => e.phase === "merged");
    save(this.#state);
    this.#emit();
  }

  async reject(_id: string, _reason: string): Promise<void> {
    this.#state.step = TIMELINE.findIndex((e) => e.phase === "change_found");
    save(this.#state);
    this.#emit();
  }

  async setEmulatedDate(date: string): Promise<void> {
    this.#state.emulatedDate = date;
    if (this.#state.before) this.#state.before = resultFor("before", date);
    if (this.#state.after) this.#state.after = resultFor("after", date);
    save(this.#state);
    this.#emit();
  }

  async run(side: "before" | "after"): Promise<AsyncIterable<RunChunk>> {
    const result = resultFor(side, this.#state.emulatedDate);
    this.#state[side] = result;
    save(this.#state);

    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<RunChunk> {
        yield { phase: "request", data: result.request };
        await pause(450);
        yield { phase: "response", data: { status: result.status, excerpt: result.responseExcerpt } };
        await pause(650);
        yield { phase: "tests", data: result.tests };
      },
    };
  }

  async loadLastRun() {
    return { before: this.#state.before, after: this.#state.after, emulatedDate: this.#state.emulatedDate };
  }
}

export const mockAdapter = new MockAdapter();
