# The agent was better at following instructions than I was at writing them

*Building Upstream Watch for the Agent Harness Hackathon — WeMakeDevs × TrueFoundry, August 2026*

---

Dependabot tells you when a package version changes. Nothing tells you when the API *behind*
it changes — a deprecation note in a changelog nobody reads. That is how a working integration
breaks at 2 AM with no diff in your lockfile.

So: an agent that watches the changelogs of the APIs your code depends on, patches your code
when they change, opens a pull request, and stops for your approval before merging. Built on
[TrueForge](https://github.com/truefoundry/trueforge).

It works. `check upstream` in a session produces two watcher subagents in parallel, a patcher
subagent in a Daytona sandbox, a real pull request, and a run that pauses at
`tool.approval_required` with the PR sitting open and unmerged until a human says otherwise.

This is not a post about that. This is a post about the seven times it did not work, because
those turned out to be the interesting part.

## 1. The page I designed around does not exist in the DOM

I built the scraper against a fixture I wrote myself. Clean `<article>` elements, sensible
class names, a `data-date` attribute. Every heuristic I tuned against it worked beautifully.

Then I fetched the real Stripe changelog. 3.1 MB containing exactly **one** `<article>` tag —
and 312 distinct dates. The class names are build-hashed (`sn-1iugkao`, and some are literally
`⚙`). My self-repair engine, pointed at it, proposed nothing at all.

Stripe server-renders the whole changelog into `window.__INITIAL_STATE__` and hydrates it. The
data was there — 880 entries, each carrying Stripe's own `breaking` boolean and the exact API
symbols it changes:

```json
{ "title": "Removes support for specifying payment method types in Payment Intents",
  "breaking": true,
  "affected": ["PaymentIntent#confirm", "PaymentIntent#create", "SetupIntent#create"] }
```

That is *better* than the DOM. Stripe tells you what is breaking, so you do not have to guess
from prose, and you can match `PaymentIntent#create` exactly instead of grepping for the word
"deprecated". The extraction spec gained a `strategy` field and the whole approach improved.

**A fixture you invented tests your assumptions, not the world.** Fetching the real page on day
one would have changed the design for the better and cost one request.

## 2. The sponsor's compliance policy blocked the vendor I designed around

With a working Bright Data key, `pnpm check` returned `SCRAPE FAILED after 3 attempts`. The raw
request came back **HTTP 200 with a zero-byte body**, after 66 seconds. Credentials were fine —
`example.com` returned in 0.7s.

`format: "raw"` gives you the page or nothing, and nothing carries no explanation. Re-requesting
the same URL with `format: "json"` returned an envelope that *could* carry an error, and did:

```
status_code: 403
error="destination_ip_prohibited"
details="policy_20050: Forbidden: target site requires special permission…"
```

Bright Data will not scrape `docs.stripe.com` without KYC. Stripe is a payments company —
obviously a restricted category, in hindsight, after two days of building around it.

**An opaque success is worse than an error.** 200-and-empty cost far more time than a 403 would
have. When an API lets you choose its response envelope, choose the one that can deliver bad
news.

The fix made the project better: a per-vendor `source: live | cache`, Stripe pinned to a
committed real capture with the policy ID in a comment, and **Cloudflare, OpenAI and Slack
added as genuinely live vendors**. Four vendors, three live, and every run prints which is
which.

## 3. The regex that had been lucky twice

Adding Slack, its 221 entries extracted and **zero** validated. Every date empty, despite
`datePublished` sitting right there in the JSON.

```js
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
```

Slack's value is `2026-08-20T00:00:00.000Z`. The character after the date is `T`. `0` and `T`
are *both* word characters — so there is no word boundary there, and the match fails.

It had never been correct. It passed for Stripe only because `2026-08-26.dahlia` happens to
have a `.` in that position, and for Cloudflare because `datetime="2026-08-30"` has a quote. Two
data sources in a row, both lucky.

**A regex that passes on every input you have tried is not the same as a correct one.** It took
a third source to expose it, and `\b` on the end of a numeric pattern is a trap whenever the
next character might be a letter.

## 4. The local sandbox is not a free substitute for the real one

Before Daytona was configured, TrueForge fell back to a local sandbox. It looked like it would
do. It would not:

```
git ls-remote failed — no active GUI session       (skill install)
/bin/bash: pnpm: command not found                 exit 127
/bin/bash: /Users/…/pnpm: Operation not permitted   exit 126
```

It denies `/Library/Developer`, so the Xcode `git` shim cannot resolve; and it refuses to
execute host binaries, so `pnpm` is unreachable regardless of `PATH`. Both work fine in an
ordinary shell. The sandbox was doing its job.

Worth saying plainly, because "sandboxing" reads like a checkbox on a judging rubric: the
moment the agent needed to run code it had written, the isolated environment was the only thing
that could, and the laptop was correctly refused.

## 5. The agent followed my instructions better than I wrote them

With Daytona working, the sandbox turned out to be barer than my spec assumed: Debian, root,
`git` and `curl` and `python3` — and no Node, npm, pnpm, corepack or `xz`.

The agent tried `pnpm`, then `corepack`, then `npm`, then stopped and printed four facts:

```
Bootstrap failed: dependencies could not be installed.
- Repo cloned: /opt/repo    - pnpm missing    - corepack missing    - npm missing
Stopping before reading project files, per bootstrap rule.
```

It did not invent a workaround that would half-work and cost an hour of debugging. The
instruction that earned its place was the one telling it **when not to be resourceful**:

> If bootstrap fails, report the exact failing command and stop; do not improvise a substitute.

I have written a lot of prompt text about what an agent should do. That is the line that paid
for itself.

## 6. "Do the right thing" is not a specification

Two runs, same input, two different answers. One watcher improvised a `DEMO_MODE=1` retry when
the live scrape failed for missing credentials; the next declared the vendor broken and patched
nothing.

Both were reasonable. Neither was specified. The sandbox clones the repo from GitHub and `.env`
is gitignored, so credentials are simply absent there — and nothing said what to do about it,
so the model invented a policy per run.

The fix was to stop asking. `createScraperClient` now treats "no credentials" exactly like
demo mode, and `provenance` still reports `cache` in the CLI and in every PR body, so nothing
claims to be live that is not.

**Where behaviour must be identical every time, encode it.** A prompt that says "do the right
thing" is a hope, not a contract.

## 7. The review found the hole in the security property I had written down three times

Qodo reviewed every pull request. Across four, it raised **16 findings, none of which I
dismissed as invalid**. The one worth reading:

This project states in three separate files that changelog text is untrusted third-party data.
The PR builder carefully quoted the changelog *body* — and interpolated the vendor-controlled
*title* straight into a Markdown heading.

A changelog title containing newlines could forge sections in a pull request a human was about
to approve. Every test passed, because the tests were written by the same mind that wrote the
bug.

It also caught a last-good regression check that compared a candidate against its own output —
`found` could never differ from `checked`. A green light wired to nothing, which is worse than
no check at all.

**A green suite proves the code does what you thought of.** It says nothing about what you did
not.

## What actually made it work

Two decisions, both narrowing rather than adding.

**Gating one tool by name.** `require_approval_for_tools: ["merge_pull_request"]` — not
`@write`. The agent opens branches, pushes files and creates pull requests freely, and stops
only at the irreversible step. A blunter gate would have made it ask permission for everything,
and it would never have run unattended.

**Patching only what is ours.** The spec filters events to "breaking OR mentions a watched
symbol", which is right for reporting. Followed literally at the patch step, one Stripe release
spawned four patcher subagents — four sandboxes and three pull requests for payouts, trial
offers and vault bank accounts that this repo never touches. Splitting on relevance turned that
into one of each.

Same shape as the OpenAI watcher paging 40 kB of JSON through its own context to report that
two of 86 entries mattered. **Most of the work of making an agent good is deciding what it
should not do.**

## The part I would show a judge

The agent had a passing test suite, a defensible two-line diff, and an open pull request:

```diff
-export const RISK_MODEL = "gpt-5-mini-2025-08-07";
+export const RISK_MODEL = "gpt-5.6-terra";
```

It asked to merge. It was stopped. The PR stayed `OPEN`, unmerged, until a human clicked
approve — and the model in that diff genuinely shuts down on 2026-12-11, with `gpt-5.6-terra`
named as the replacement by OpenAI's own deprecations page.

The agent does the work. The human keeps the merge button.

---

*Repo: https://github.com/Kush614/upstream-watch — the raw failure log this was written from is
[`NOTES.md`](../NOTES.md).*
