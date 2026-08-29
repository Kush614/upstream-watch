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
