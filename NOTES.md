# NOTES — what broke, and what we did about it

Running log. Append, never rewrite. Newest at the bottom. This file is the source for the
blog post (Field Report track), so write entries as if a stranger will read them.

**Entry format:**

```
## YYYY-MM-DD HH:MM — one-line summary
**Where:** component / file
**Symptom:** what you actually saw (paste the error)
**Cause:** what was really wrong
**Fix:** what changed
**Lesson:** the sentence worth keeping
```

---

## 2026-08-29 — Repo scaffolded

**Where:** whole repo
**Symptom:** n/a — starting point.
**Cause:** n/a
**Fix:** Created the skeleton from `CLAUDE.md` §3, wrote `docs/PLAN.md`, stubbed `specs/`.
**Lesson:** The plan is written before the build day starts, so the cut order is decided while
nobody is panicking. Open questions are recorded as `VERIFY:` markers rather than guesses —
every one of them is a thing that can eat an hour tomorrow if it is wrong.

## 2026-08-29 — Node's type stripping is not the same as compiling TypeScript

**Where:** `pipeline/src/clients/*.ts`, `pipeline/src/errors.ts`
**Symptom:** Every test passed, then `pnpm demo:seed` died instantly:
`SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not
supported in strip-only mode`.
**Cause:** We run the pipeline with `node --experimental-strip-types`, which *erases* type
annotations rather than compiling them. Anything that needs real codegen — parameter
properties (`constructor(private readonly x)`), enums, namespaces — has no erased form, so it
fails at runtime. Vitest uses a full transform, so the whole test suite was green while the
actual entry point could not start.
**Fix:** Rewrote the three constructors to use `#private` fields, and set
`"erasableSyntaxOnly": true` in `tsconfig.base.json`. That turns this from a runtime crash into
a typecheck error — it caught a third instance in `errors.ts` the moment it was switched on.
**Lesson:** When the test runner and the production runtime use different transforms, a green
suite proves less than it looks like it proves. Make the stricter runtime's constraints visible
to the typechecker, or you will find out at the worst moment. Worth 10 minutes tonight rather
than 10 minutes at 16:00 tomorrow.

## 2026-08-29 — Qodo found the hole in our own security boundary

**Where:** `pipeline/src/lib/pr.ts`, and six other places
**Symptom:** Three PRs, 39 passing tests, and a review that came back with 14 findings — 2 on
#1, 7 on #2, 5 on #3. Zero rule violations, so nothing stylistic. All fourteen were real; none
were dismissed.
**Cause:** Two patterns, repeated.

*Defaults that are right in demo mode and wrong in production.* `loadState` caught every read
failure and returned `{}` — correct for a missing file, catastrophic for a corrupt one, because
an empty state baselines the whole page and suppresses every change since the last good run.
`pr:body` defaulted `provenance` to `"fixture"`, so a live run whose caller omitted the field
would publish a PR claiming it used cached data. Both fail silently, and both fail in exactly
the case that matters.

*Guarding the obvious half of the input.* `buildPr` carefully quoted the changelog `body` and
then interpolated the `title` straight into a Markdown heading. A vendor title containing
newlines could forge sections in a PR a human is about to approve. We had written "changelog
text is untrusted data" in three separate files and then left half of it unquoted.

The sharpest finding was subtler: the extraction failure path only fired when *zero* entries
validated, so a page where one entry was malformed and the rest were fine dropped that entry
silently. Qodo's observation was about which entry that tends to be — a newly added one, in a
format the vendor just changed. Precisely the entry this project exists to catch, and it could
have stayed invisible indefinitely.

**Fix:** All 14 fixed on the branch each belonged to, then the stack rebased and re-reviewed.
Test count went 39 → 58. Every fix has a regression test, including one that feeds `buildPr` a
title trying to forge an `## Approved by security` heading.
**Lesson:** A green test suite proves the code does what you thought of. It says nothing about
what you did not think of, and "we wrote the security property down in three files" is not the
same as enforcing it in the one function that renders output. The review was worth more than the
tests here, because the tests were written by the same mind that wrote the bugs.

Second lesson, cheaper: stacked PRs make review findings land on the wrong PR. Two of #3's
findings were really about #1 and #2. Fixing them where the code lives — rather than where the
review comment was — kept each PR coherent, at the cost of a rebase.

## 2026-08-30 — The page we planned to scrape does not exist in the DOM

**Where:** `skills/brightdata-changelog-scraper/SKILL.md`, `pipeline/src/lib/parse.ts`
**Symptom:** The spec assumed `entry_selector` plus CSS field selectors. Fetching
`https://docs.stripe.com/changelog` for real returned 3.1 MB containing exactly **one**
`<article>` tag — and 312 distinct ISO dates. The deterministic repair engine, pointed at
it, proposed nothing at all.
**Cause:** Stripe server-renders the changelog into `window.__INITIAL_STATE__` as JSON and
hydrates it. The rendered class names are build-hashed (`sn-1iugkao`, and some are literally
`⚙`), so even where markup exists, a selector written today breaks on their next deploy.
**Fix:** Added `strategy` to the extraction spec. `css` stays the default; `embedded-json`
walks a dotted path into the page's own state blob. Stripe turned out to publish far better
data than the DOM would have: 880 entries, each with its own `breaking` boolean and the exact
API symbols it changes (`PaymentIntent#create`, `payment_method_types`). We match on those
instead of guessing breakage from prose.
**Lesson:** The most valuable thing in this build came from fetching the real page early
instead of building against a fixture I had written myself. My hand-authored fixture was
clean, well-structured, and nothing like the truth — and every heuristic I tuned against it
scored zero on the real thing. A fixture you invented tests your assumptions, not the world.

## 2026-08-30 — The blocked UI was never blocked

**Where:** `ui/`, `docs/PLAN.md` §8 item 4
**Symptom:** "Is `@truefoundry/trueforge-ui` embeddable standalone?" sat as the open question
gating the whole UI track, and the cut order had a fallback ready for the answer being no.
**Cause:** Nobody ran `npm view`. It is published — 0.2.4 — and it exports
`useTrueFoundryRespondToToolApproval`, `ToolApprovalBar`, and `ApprovalDecision`: a
ready-made approve/deny-with-reason control, which is exactly what `specs/ui.md` describes
building by hand.
**Fix:** Built the three panels. `src/adapter.ts` is the only file that talks to the harness,
so pointing it at the real session and approval routes is a one-file change.
**Lesson:** An unknown marked VERIFY still needs someone to spend the sixty seconds. This one
had been carried as a risk through a plan, a cut order and two commits, and it cost one
command to answer.

## 2026-08-30 — The sponsor's compliance policy blocked the vendor we designed around

**Where:** `pipeline/src/clients/brightdata.ts`, `agent/targets.yaml`
**Symptom:** With a working Bright Data key and zone, `pnpm check` reported
`SCRAPE FAILED after 3 attempts`. The raw request returned **HTTP 200 with a zero-byte body**
after 66 seconds — three times, once per retry. A test fetch of
`https://geo.brdtest.com/welcome.txt` worked instantly, and so did `https://example.com`, so
the credentials were fine.
**Cause:** `format: "raw"` gives you the page or nothing, and "nothing" here was not a timeout.
Re-requesting with `format: "json"` returned the envelope, and the envelope had the answer:

```
status_code: 403
proxy-status: error="destination_ip_prohibited";
  details="policy_20050: Forbidden: target site requires special permission…
           not permitted by our compliance policy"
```

Bright Data will not scrape `docs.stripe.com` without KYC. Stripe is a payments company; in
hindsight, obviously a restricted category. The project had been designed around it for two
days.

**Fix:** Added a per-vendor `source: live | cache` to `agent/targets.yaml`. Stripe is pinned to
its committed real capture with the policy ID in a comment, and **Cloudflare's changelog was
added as a genuinely live vendor** — Bright Data permits it, it is ordinary server-rendered
markup, and it gave the `css` extraction strategy its first real-world case (25 entries,
25 valid, relative permalinks resolved). `demo-app` gained a Cloudflare cache-purge call, so
the second vendor maps to real code rather than being decorative. Every run and every PR body
prints which vendor was live and which came from cache.

**Lesson:** Two things. First, an opaque success is worse than an error — `format: "raw"`
returning 200-and-empty cost far more time than a 403 would have, and the fix was to ask the
same API for a shape that could carry an error. When a client can choose its response
envelope, choose the one that can tell you bad news.

Second: check what your data provider is *allowed* to fetch before designing around a source.
I verified the endpoint, the auth, the request shape and the parse strategy against the real
page — everything except whether the vendor would serve it at all. That check costs one
request and I did it on day two instead of day one.

## 2026-08-30 — The agent runs; the local sandbox is the wall

**Where:** TrueForge agent `upstream-watch`, local sandbox provider
**Symptom:** With the OpenAI provider configured, the skill registered and the agent saved, a
`check upstream` turn ran and immediately did the right thing — it read
`agent/targets.yaml` exactly as `agent/prompts/orchestrator.md` instructs. Then every `exec`
came back with:

```
Sandbox initialization failed: git ls-remote failed (exit 1):
  …could be requested (possibly because there is no active GUI session)
  (skill: brightdata-changelog-scraper)
```

Removing the skill let the sandbox initialise, and `exec` then worked — but:

```
/bin/bash: pnpm: command not found                    exit 127
/bin/bash: /Users/kush/.local/bin/pnpm: Operation not permitted   exit 126
```

**Cause:** Two faces of the same thing. TrueForge's **local** sandbox is genuinely isolated: it
denies `/Library/Developer`, so the Xcode `git` shim cannot resolve and the git-backed skill
install fails; and it refuses to execute binaries from the host toolchain, so `pnpm` is
unreachable whether or not it is on `PATH`. `git ls-remote` and `pnpm` both work perfectly in
an ordinary shell — the restriction is the sandbox doing its job.

**Fix:** None locally, and none wanted. This is what Daytona is for, and it is precisely the
contract `specs/patcher.md` §Steps already describes: clone the repo, `pnpm install
--frozen-lockfile`, run the tests — in an environment that has a toolchain, rather than
borrowing the host's.

**Lesson:** The local sandbox looked like a free substitute for the real one and is not. Worth
saying plainly in the pitch: the sandbox is not decoration and not a checkbox — the moment the
agent needed to run our code, the isolated environment was the only thing that could, and the
laptop it was running on was correctly refused.

## 2026-08-30 — Daytona works; the sandbox image is barer than the contract assumed

**Where:** `agent/prompts/orchestrator.md`, `specs/agent.md`, TrueForge sandbox settings
**Symptom:** With Daytona configured, `exec` finally ran for real — exit 0 in a Debian
container. Then a cascade, each one uncovering the next:

```
pnpm: command not found            → tried corepack
corepack: command not found        → tried npm
npm: command not found             → "Bootstrap failed", agent stopped
xz: Cannot exec                    → .tar.xz could not be unpacked
```

**Cause:** Probing it directly settled what guessing could not. The image is Debian 12,
running as **root**, with `git`, `curl`, `python3` and `apt-get` — and **no Node, npm, pnpm,
corepack or xz**. `specs/patcher.md` §Steps says "clone the repo; `pnpm install
--frozen-lockfile`", which quietly assumes a toolchain that is not there. The sandbox also
defaults to `exec_timeout_ms: 60000`, and downloading Node plus installing a pnpm workspace
does not fit in 60 seconds.

**Fix:** The orchestrator bootstrap now installs Node from the official **`.tar.gz`** build
into `/opt/node` before cloning, and every later command re-exports `PATH` because each `exec`
is a fresh shell. `exec_timeout_ms` raised to 600000.

**Lesson:** The agent behaved better than the prompt did. Told "if bootstrap fails, report the
exact failing command and stop; do not improvise a substitute", it tried three package
managers, then stopped and printed four facts — rather than inventing a workaround that would
have half-worked and wasted an hour. The instruction that paid off was the one telling it when
*not* to be resourceful.

Second lesson: I wrote `.tar.xz` because that is the download I reach for by habit. One probe
of the actual image would have told me `xz` was missing before I spent a round-trip on it —
the same mistake as assuming Bright Data could reach Stripe.

## 2026-08-30 — The loop closed

**Where:** everywhere
**Symptom:** n/a — this one worked.

One `check upstream` in a TrueForge session, with the relevance filter fixed:

```
bootstrap        Node installed, repo cloned, pnpm install (15.2s)
skill            loaded from /opt/tf/skills/brightdata-changelog-scraper
[thread]         watch-stripe  ┐ two watcher subagents, in parallel
[thread]         watch-cloudflare ┘
[thread]         patch-stripe-payment-method-types   ← ONE patcher, not four
  patched        demo-app/src/payments.ts, stripe.ts, test/payments.test.ts
  pnpm verify    3 typechecks, 116/116 tests
  PR #5          opened via GitHub MCP
"Merge PR #5"  → tool.approval_required — run paused, PR still OPEN, NOT MERGED
```

The patch is the real migration the changelog describes: `charges.create` →
`paymentIntents.create`, the card token routed through `payment_method_data.card.token`, and
`payment_method_types` removed — which is exactly what Stripe's entry says now returns a 400.
The agent updated the pinned test itself, which `specs/patcher.md` rule 4 asks for and which I
never told it to do.

**Lesson:** The two things that made this work were both restraints rather than capabilities.
Gating `merge_pull_request` *by name* rather than using `@write` let the agent open PRs freely
while still stopping at the one irreversible step — a blunter gate would have made it ask
permission for everything and the loop would never have run unattended. And narrowing the
patch step to `relevance: symbol-match` turned four sandboxes and three unwanted PRs into one
of each.

The approval gate is not a formality bolted on for the judging criteria. The agent genuinely
wanted to merge, had a green test suite and a defensible diff, and was stopped anyway. That is
the whole product in one event.
