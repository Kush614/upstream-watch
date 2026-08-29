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

## 2026-08-30 — Two more vendors, and a date regex that had been lucky

**Where:** `pipeline/src/lib/parse.ts`, `skills/…/SKILL.md`, `agent/targets.yaml`
**Symptom:** Adding OpenAI and Slack, both extracted but neither validated. OpenAI: 145 of 150
rows valid. Slack: **0 of 221** — every entry had an empty date, despite `datePublished`
being right there in the JSON.
**Cause:** Two, and the second had been hiding since the first day.

OpenAI's tables print `2026‑03‑26` with U+2011, a non-breaking hyphen, which is not `-`.

The real one: `ISO_DATE` was `/\b(\d{4}-\d{2}-\d{2})\b/`. Slack's `datePublished` is
`2026-08-20T00:00:00.000Z` — the character after the date is `T`, and `0` and `T` are *both*
word characters, so no word boundary exists there and the match fails. It had worked for
Stripe purely because `2026-08-26.dahlia` happens to have a `.` in that position, and for
Cloudflare because `datetime="2026-08-30"` has a quote. The regex was never right; it had been
lucky twice.

**Fix:** `(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)` — same protection, no boundary trap — plus
normalising Unicode dashes, plus a text-date parser for `Jan 20, 2027`. Also added
`breaking_default` to the extraction spec: OpenAI's rows are `<date> <deprecated>
<replacement>` and never contain the word "deprecated", so keyword hints cannot see what the
page as a whole obviously is.

**Lesson:** A regex that passes on every input you have tried is not the same as a correct one,
and `\b` on the end of a numeric pattern is a trap whenever the next character might be a
letter. It took a third data source to expose it. The tests now pin the exact case
(`"...T00:00:00.000Z"`), which is the only reason it stays fixed.

**And the better demo:** OpenAI's deprecations page states the replacement — `gpt-5-mini-2025-08-07
→ gpt-5.6-terra`. Stripe says "this is deprecated" and leaves you to work out the migration;
OpenAI hands you the target, so the patch is checkable rather than inferred. The model
`demo-app/src/risk.ts` is pinned to shuts down 2026-12-11.

## 2026-08-30 — Three ways the same run failed, none of them the code

Running the agent against OpenAI took four attempts. Each failed differently, and only the
first was a design problem.

**1. The watcher paged 40 kB through its own context.** OpenAI's deprecations page yields 86
new entries, nearly all models this repo never calls. The watcher prompt says "return ONLY a
JSON array of ChangeEvent objects", so the subagent dutifully read the whole array back in
chunks to report that two of them mattered. Fixed with `--relevant`: actionable events plus a
count of the rest, 40328 bytes down to 1492.

**2. The same input gave two different answers.** One run's watcher improvised a `DEMO_MODE=1`
retry when the live scrape failed for missing credentials; the next declared the vendor broken
and patched nothing. The sandbox clones this repo from GitHub and `.env` is gitignored, so
credentials are simply absent there — and nothing said what to do about it, leaving the model
to invent a policy per run. Now `createScraperClient` treats "no credentials" the same as
DEMO_MODE, and `provenance` still reports `cache` everywhere.

**3. Daytona ran out of disk.** `Sandbox initialization failed: Total disk limit exceeded.
Maximum allowed: 30GiB.` Each sandbox reserves 3 GiB and TrueForge's default
`auto_delete_interval_in_minutes` is 7200 — five days. Ten runs filled the quota exactly.
Deleted nine via Daytona's API and dropped retention to 30 minutes.

**4. And then I did it to myself.** After all that the agent reported "no changes found" — and
it was right. I had run plain `pnpm check` to read one line of mode output, which recorded all
86 entries as seen, and committed that state. The agent cloned a branch where nothing was new.
`--no-persist` exists precisely to prevent this; I built it, documented it, and then did not
use it.

**Lesson:** Only one of the four was a bug in the product. The others were an agent left to
improvise a policy, a quota nobody was watching, and me not following my own instruction. The
fix for the first two was to *encode* the decision rather than hope for it — a prompt that says
"do the right thing" is not a specification.

## 2026-08-30 — I deleted the branches my own pull requests were standing on

**Where:** the PR stack, #1–#4
**Symptom:** Merging four stacked PRs bottom-up with `gh pr merge --merge --delete-branch`,
#1 and #3 merged; **#2 and #4 closed themselves**. Not merged — closed.
**Cause:** The stack was `feat/demo ← feat/pipeline ← feat/agent ← feat/spec-align`, each PR
based on the one below. `--delete-branch` removed `feat/demo` and `feat/agent` the moment they
merged, and a pull request whose base branch no longer exists is closed by GitHub rather than
retargeted. Worse, a closed PR whose base is gone cannot be reopened at all — `gh pr reopen`
returns *"Cannot change the base branch of a closed pull request"*. Two reviewed PRs, one of
them carrying 22 commits and a clean Qodo pass, unrecoverable as PRs.
**Fix:** Nothing was lost — `feat/spec-align` was intact locally and on the remote the whole
time, and the review history on #1–#4 survives as evidence. But the stack could not be
reassembled, so the work went to `main` as a single new PR with the prior review status carried
over in its description.
**Lesson:** `--delete-branch` is safe on an isolated PR and quietly destructive on a stacked
one. Either merge stacks top-down, or retarget each PR's base *before* merging the one beneath
it, or simply do not delete branches until the whole stack has landed. The irreversible part
was not the merge — it was the cleanup flag attached to it, which is a bad place to put
irreversibility.

There is an irony worth keeping: this project exists to stop an agent from doing something
irreversible without asking. I did the irreversible thing to myself, by hand, with a convenience
flag I did not think about.

## 2026-08-30 — A 200 that meant "no"

**Where:** `ui/vite.config.ts`, the dev proxy to TrueForge
**Symptom:** Approving the pending merge gate through the UI's own transport failed, and the
failure looked like success. Every `/api/...` request through `localhost:5173` returned
**HTTP 200** — with `<!doctype html>` and the app's own shell as the body.
**Cause:** `npx @truefoundry/trueforge` binds `[::1]:8790`. The proxy target defaulted to
`http://localhost:8790`, which resolves to `127.0.0.1` here, where nothing listens. Vite fell
through to its SPA handler and answered every API call with `index.html`. From the browser it
is indistinguishable from a healthy server returning unexpected JSON: 200 on every request,
nothing in the log, and the app quietly reporting "local feed" forever.
**Fix:** Default the target to `http://[::1]:8790`, and register a proxy `error` handler that
logs `[proxy] TrueForge unreachable: …` rather than letting a dead upstream fall through
silently.
**Lesson:** Second time this shape has cost me time today — Bright Data's `format: "raw"`
returning 200-and-empty for a blocked domain, and now a dev proxy returning 200-and-HTML for a
dead upstream. **An opaque success is the most expensive failure mode there is**, because every
check you would normally run says the system is fine. Both fixes were the same: make the
component capable of saying no.

Worth noting how it was found: not by testing the proxy, but by trying to approve a real
merge through it. The UI had passed its unit tests all along.

## 2026-08-30 — Moving a prompt into a file makes the file a dependency

**Where:** `demo-app/src/risk.ts`, `agent/prompts/risk-summary.md`
**Symptom:** None yet — caught in review before it could happen.
**Cause:** Moving the fraud-risk instructions out of TypeScript and into
`agent/prompts/risk-summary.md` satisfies `CLAUDE.md` §7, but it turns a string that could
never fail into a file read that can. A missing or unbundled Markdown file would surface as a
bare `ENOENT` thrown from inside a payment request — a confusing place to discover that a docs
file was not deployed. The same applies if the file exists but has nothing below its `---`
separator: the model would receive an empty prompt and answer anyway.
**Fix:** `promptTemplate()` catches both and throws with the path and the reason, naming
`CLAUDE.md` §7 so the next person knows the file is load-bearing rather than documentation.
**Lesson:** "Move it into a config file" is not free. Every string promoted to a file becomes a
deployment artifact, and every artifact can be absent. The rule that prompts live in `.md`
files is a good one; it just quietly adds a failure path each time it is applied, and those are
worth handling where they occur rather than at the top of a request.

## 2026-08-30 — The snapshot command documented its own failure

**Where:** `scripts/snapshot-session.ts`, `pipeline/src/clients/trueforge.ts`
**Symptom:** Running `pnpm demo:snapshot` with TrueForge stopped:

```
demo:snapshot failed: Could not reach TrueForge at http://[::1]:8790.
Is it running? (npx @truefoundry/trueforge)
```

and an entry appeared in this file on its own, naming the component, the symptom and the
cause (`{"path":"/sessions","cause":"TypeError: fetch failed"}`).
**Cause:** Deliberate — I had killed the harness to prove the UI renders offline, then ran the
snapshot command against it.
**Fix:** None needed; this is the behaviour working. `TrueForgeHttpClient` throws a typed
`TrueForgeError` naming the address and how to start the server, and the top-level handler
appends to `NOTES.md` as `CLAUDE.md` §7 requires.
**Lesson:** Qodo asked for two things here that felt like bureaucracy — route the call through
a client, and log the failure path — and the payoff showed up within a minute of implementing
them. The error told me exactly what was wrong and where, and wrote itself down without being
asked. Failure documentation is cheap to add while writing the failure and expensive to
reconstruct afterwards.


## 2026-08-30 — The proof was showing a request no commit ever made

**Where:** `scripts/proof-runner.ts` (now `scripts/proof/`)
**Symptom:** None visible — the columns looked right. Qodo found it by reading.
**Cause:** The runner *composed* the request it displayed (`{model, input, store}`) and sent
that itself, rather than capturing what the checked-out commit actually sent during its test
run. The screen would have attributed a request body and a status to a commit that may never
have produced them. On a page whose entire claim is "everything here is real except the
labelled emulation", that is the one thing that must not be approximated.
**Fix:** The emulated vendor now records every request it receives, and the column reports the
last one from that side's own test run. If a commit never called the vendor, the run raises
rather than inventing a receipt.

Two more from the same review, both the same shape:

- A test run producing no vitest summary was reported as `{passed: 0, failed: 0}` — a broken
  run dressed as a clean one. It now raises: a run that did not happen has not failed zero
  tests.
- Copying today's tests into the historical worktree swallowed its errors. Had `cp` failed,
  the proof would have graded old code against old expectations and presented that as the
  guarantee. It now raises and says exactly that.

**Lesson:** Every one of these is the same bug wearing different clothes, and it is now the
fourth time this review has caught it in this project: **an absent or failed result rendered
as a good one.** `passed !== false`, `testsPassed ? true : null`, a green tick over a failing
suite, and now a fabricated request. The pattern is not carelessness about error handling —
it is that the happy path is the one you write first and the one you look at, and every
shortcut in it defaults toward "fine". Where a human reads the output before doing something
irreversible, absence has to render as absence.
