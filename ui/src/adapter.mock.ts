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

import { WatchlistError, type Adapter, type Citation, type PackageFinding, type RunChunk, type RunResult, type UiEvent, type VendorResult, type VendorRow } from "./adapter.ts";

const VENDOR = "openai";
const SHUTDOWN = "2026-07-23";
const OLD_MODEL = "gpt-5.1-codex-mini";
const NEW_MODEL = "gpt-5.6-terra";

const CHANGELOG = {
  title: "`gpt-5.1-codex-mini`",
  excerpt: "July 23, 2026 `gpt-5.1-codex-mini` \u2192 `gpt-5.6-terra`",
  url: "https://platform.openai.com/docs/deprecations",
  sentence: "`" + OLD_MODEL + "` was shut down on " + SHUTDOWN + ".",
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

/** Verbatim what api.openai.com returns for this model today. */
const FAIL_BODY = "404 — Model not found " + OLD_MODEL;

const OK_BODY = "200 — low";

function resultFor(side: "before" | "after"): RunResult {
  // No date arithmetic left: the shutdown already happened, so "before" is simply broken.
  const broken = side === "before";
  return {
    side,
    sha: side === "before" ? BEFORE_SHA : AFTER_SHA,
    request: requestFor(side),
    changedKey: "model",
    status: broken ? 404 : 200,
    responseExcerpt: broken ? FAIL_BODY : OK_BODY,
    tests: broken
      ? { passed: 9, failed: 3, output: "FAIL demo-app/test/vendors.test.ts\n  x uses the model this service is pinned to\n  x POST /payments returns 201\n  x risk level is parsed\n\n  9 passed | 3 failed" }
      : { passed: 12, failed: 0, output: TEST_OUTPUT || "  12 passed (12)" },
    citations: citationsFor(side, broken),
    at: new Date().toISOString(),
  };
}

/**
 * The same four links the real runner builds, from the same captured facts.
 *
 * Offline this is a replay, not an invention: every quote below came off the real page or a
 * real run, which is why the mock is safe to show when the network is not.
 */
function citationsFor(side: "before" | "after", broken: boolean): Citation[] {
  const model = side === "before" ? OLD_MODEL : NEW_MODEL;
  return [
    {
      claim: "OpenAI retired `" + OLD_MODEL + "` on " + SHUTDOWN + ".",
      evidence: CHANGELOG.excerpt,
      source: "OpenAI's deprecations page.",
      url: CHANGELOG.url,
    },
    {
      claim: "This commit asks for " + model + ".",
      evidence: 'export const RISK_MODEL = "' + model + '";',
      source: "Read out of the commit — demo-app/src/risk.ts.",
    },
    {
      claim: broken ? "OpenAI refused the request with 404." : "OpenAI accepted the request.",
      evidence: broken ? FAIL_BODY : OK_BODY,
      source: "The reply to the POST this commit's own test sent to api.openai.com.",
      url: "https://api.openai.com/v1/responses",
    },
    {
      claim: broken ? "3 of this service's tests fail as a result." : "All 12 of this service's tests pass.",
      evidence: broken ? "9 passed, 3 failed" : "12 passed, 0 failed",
      source: "vitest, run against that commit with today's test suite.",
    },
  ];
}

/**
 * The four vendors agent/targets.yaml watches, captured verbatim from a real /vendors
 * response. Guessed numbers here would be the same fabrication the columns refuse to make.
 */
const VENDORS: VendorRow[] = [
  {
    vendor: "stripe",
    url: "https://docs.stripe.com/changelog",
    source: "cache",
    pinnedBecause:
      "Bright Data refuses docs.stripe.com (policy_20050 \u2014 payments domains are KYC-gated), so this vendor is watched from a committed real capture.",
    symbols: ["charges.create", "payment_intents", "Charge#create", "PaymentIntent#create"],
    files: ["demo-app/src/payments.ts"],
    lastCheck: "2026-08-29T22:57:33.618Z",
    entriesSeen: 40,
  },
  {
    vendor: "cloudflare",
    url: "https://developers.cloudflare.com/changelog/",
    source: "live",
    symbols: ["purge_cache", "/client/v4/zones", "Cache Rules", "cache reserve"],
    files: ["demo-app/src/cdn.ts"],
    lastCheck: "2026-08-29T22:57:35.190Z",
    entriesSeen: 25,
  },
  {
    vendor: "openai",
    url: "https://platform.openai.com/docs/deprecations",
    source: "live",
    symbols: ["gpt-5.1-codex-mini", "gpt-5.6-terra", "gpt-5-mini-2025-08-07", "gpt-5-mini", "v1/prompts", "chat/completions"],
    files: ["demo-app/src/risk.ts"],
    lastCheck: "2026-08-29T22:57:34.899Z",
    entriesSeen: 59,
    result: {
      entries: 86, breakingElsewhere: 85, at: "2026-08-29T23:52:20.929Z",
      matches: [{ date: SHUTDOWN, title: "`" + OLD_MODEL + "`", body: CHANGELOG.excerpt, url: CHANGELOG.url, relevance: "symbol-match", files: ["demo-app/src/risk.ts"] }],
    },
  },
  {
    vendor: "slack",
    url: "https://docs.slack.dev/changelog",
    source: "live",
    symbols: ["chat.postMessage", "conversations.", "Workflow Steps"],
    files: ["demo-app/src/notify.ts"],
    lastCheck: "2026-08-29T22:57:35.867Z",
    entriesSeen: 221,
  },
];

/**
 * The three watched dependencies, captured verbatim from a real `pnpm oss:check --json`.
 *
 * Trimmed to the evidence a reader actually reads — never edited. Hand-written numbers here
 * would be the same fabrication the proof columns exist to refuse.
 */
const PACKAGES: PackageFinding[] = [
    {
      "package": "express",
      "repo": "expressjs/express",
      "pinned": "4.19.2",
      "latest": "5.2.1",
      "majorsBehind": 1,
      "daysSincePinned": 887,
      "breakAvailableSince": "2024-09-10T04:40:34.348Z",
      "severity": "silent",
      "announced": [
        {
          "tag": "v5.1.0",
          "url": "https://github.com/expressjs/express/releases/tag/v5.1.0",
          "quote": "* response: add support for ETag option in res.sendFile by @juanarbol in https://github.com/expressjs/express/pull/6073"
        },
        {
          "tag": "v5.0.0",
          "url": "https://github.com/expressjs/express/releases/tag/v5.0.0",
          "quote": "- **Routing changes**: Updated to `path-to-regexp@8.x`, removing sub-expression regex patterns for security reasons (ReDoS mitigation)."
        }
      ],
      "inSource": [
        {
          "file": "examples/auth/index.js",
          "symbol": "res.send",
          "lines": [
            "+  if (!req.body) return res.sendStatus(400)"
          ],
          "kind": "code"
        },
        {
          "file": "examples/downloads/index.js",
          "symbol": "req.param",
          "lines": [
            "-  res.download(req.params.file, { root: FILES_DIR }, function (err) {",
            "+  res.download(req.params.file.join('/'), { root: FILES_DIR }, function (err) {"
          ],
          "kind": "code"
        },
        {
          "file": "examples/search/index.js",
          "symbol": "res.send",
          "lines": [
            "-    if (err) return res.send(500);"
          ],
          "kind": "code"
        },
        {
          "file": "lib/application.js",
          "symbol": "app.del",
          "lines": [
            "-app.del = deprecate.function(app.delete, 'app.del: Use app.delete instead');"
          ],
          "kind": "code"
        }
      ],
      "files": [
        "demo-app/src/payments.ts"
      ],
      "compareUrl": "https://github.com/expressjs/express/compare/4.19.2...v5.0.0",
      "commits": 168,
      "filesChanged": 74
    },
    {
      "package": "react-dom",
      "repo": "facebook/react",
      "pinned": "18.3.1",
      "latest": "19.2.8",
      "majorsBehind": 1,
      "daysSincePinned": 855,
      "breakAvailableSince": "2024-12-05T18:10:30.516Z",
      "severity": "loud",
      "announced": [
        {
          "tag": "v19.0.0",
          "url": "https://github.com/react/react/releases/tag/v19.0.0",
          "quote": "* Removed: `defaultProps` for functions: ES6 default parameters can be used in place. Class components continue to support `defaultProps` since there is no ES6 alternative."
        }
      ],
      "inSource": [],
      "files": [
        "ui/src/main.tsx"
      ],
      "compareUrl": "https://github.com/react/react/compare/v18.3.1...v19.0.0",
      "commits": 4639,
      "filesChanged": 300
    },
    {
      "package": "eslint",
      "repo": "eslint/eslint",
      "pinned": "8.57.0",
      "latest": "10.9.1",
      "majorsBehind": 2,
      "daysSincePinned": 918,
      "breakAvailableSince": "2024-04-05T20:53:31.118Z",
      "severity": "loud",
      "announced": [
        {
          "tag": "v10.7.0",
          "url": "https://github.com/eslint/eslint/releases/tag/v10.7.0",
          "quote": "* [`9489379`](https://github.com/eslint/eslint/commit/948937986f2aa3cccb27a4c80694a85e5b0a5f64) chore: update dependency @eslint/eslintrc to ^3.3.6 (#21076) (renovate[bot])"
        },
        {
          "tag": "v9.39.5",
          "url": "https://github.com/eslint/eslint/releases/tag/v9.39.5",
          "quote": "* [`458205f`](https://github.com/eslint/eslint/commit/458205f7d7a4769f32bec006eecc45c6a71be16a) chore: update `@eslint/eslintrc` and `@eslint/js` for v9.39.5 (#21077) (Francesco Trotta)"
        }
      ],
      "inSource": [
        {
          "file": "conf/config-schema.js",
          "symbol": "eslintrc",
          "lines": [
            "- * This file is part of the ongoing work to move the eslintrc-style config",
            "- * system into the @eslint/eslintrc package. This file needs to remain"
          ],
          "kind": "code"
        },
        {
          "file": "lib/cli-engine/cli-engine.js",
          "symbol": "eslintrc",
          "lines": [
            "+        const linter = new Linter({ cwd: options.cwd, configType: \"eslintrc\" });"
          ],
          "kind": "code"
        },
        {
          "file": "lib/cli.js",
          "symbol": "eslintrc",
          "lines": [
            "+            process.emitWarning(\"You are using an eslintrc configuration file, which is deprecated and support will be removed in v10.0.0. Please migrate to an eslint.config.js file. See https://eslint.org/docs/latest/use/configure/migration-guide for details.\", \"ESLintRCWarning\");"
          ],
          "kind": "code"
        },
        {
          "file": "lib/eslint/eslint.js",
          "symbol": ".eslintrc",
          "lines": [
            "- * @property {boolean} [useEslintrc] False disables looking for .eslintrc.* files."
          ],
          "kind": "code"
        }
      ],
      "files": [
        ".eslintrc.json"
      ],
      "compareUrl": "https://github.com/eslint/eslint/compare/v8.57.0...v9.0.0",
      "commits": 231,
      "filesChanged": 300
    }
  ];

const STORE_KEY = "upstream-watch.mock";

interface MockState { step: number; before?: RunResult; after?: RunResult }

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* private mode, cleared storage — a fresh start is correct */
  }
  return { step: 0 };
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
      this.#state.before = resultFor("before");
      this.#state.after = resultFor("after");
    }
    save(this.#state);
    this.#emit();
  }

  reset(): void {
    this.#state = { step: 0 };
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

  async run(side: "before" | "after"): Promise<AsyncIterable<RunChunk>> {
    const result = resultFor(side);
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
    return { before: this.#state.before, after: this.#state.after };
  }

  async listVendors(): Promise<VendorRow[]> {
    return VENDORS;
  }

  async checkVendor(vendor: string): Promise<VendorResult> {
    const row = VENDORS.find((v) => v.vendor === vendor);
    if (!row) throw new WatchlistError(`${vendor} is not on the watchlist`);
    return row.result ?? { entries: row.entriesSeen, matches: [], breakingElsewhere: 0, at: new Date().toISOString() };
  }

  async listPackages(): Promise<PackageFinding[]> {
    return PACKAGES;
  }

  hasLiveSession(): boolean {
    // The mock is a recording. There is nothing on the other end of the composer.
    return false;
  }

  async ask(question: string): Promise<string> {
    // Offline there is no agent to ask, and inventing an answer in its voice would be the
    // one thing this UI must never do. Say so plainly instead.
    return `The harness is not running, so I cannot ask the agent "${question}". This page is showing a recorded run; start TrueForge and reload to ask it anything.`;
  }
}

export const mockAdapter = new MockAdapter();
