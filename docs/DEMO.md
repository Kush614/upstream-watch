# DEMO — the 3-minute script

**Target: under 4 minutes from a cold start** (`CLAUDE.md` §9). The spoken script below runs
about 3:00, leaving slack for things going slowly on the day.

Beats marked ✅ work today with no accounts configured. Beats marked ⏳ need the harness,
Daytona, and the GitHub MCP connector — verify them in preflight (`docs/PLAN.md` §3).

## Before recording

- [ ] `pnpm demo:seed` — **every time.** Without it the run has already seen the change and
      correctly reports nothing, which looks exactly like a broken demo.
- [ ] `git status` clean, `demo-app` unpatched
- [ ] `DEMO_MODE=1`
- [ ] Harness running, agent saved in the Agents Library, no session open
- [ ] Previous demo PRs closed so the new one is unambiguous
- [ ] Terminal font up, browser zoom up, notifications off
- [ ] Stopwatch visible to you, not to the camera

## The beats

### 0:00 — The problem ✅

**Show:** `demo-app/src/checkout.ts`, the `source: req.token` line.

> "This is our checkout code. It calls Stripe's Charges API, and it passes the payment token in
> a parameter called `source`. Stripe is about to deprecate that parameter. Nobody on a
> two-person team reads Stripe's changelog every week, so normally we'd find out in production."

### 0:20 — Detect ✅

**Run:**
```bash
DEMO_MODE=1 DEMO_FIXTURE=breaking pnpm check
```

**Show:** the output naming the entry, the matched symbols, and the affected path.

> "The agent scrapes the changelog through Bright Data — cached here, so this is repeatable —
> and it doesn't just find the entry. It decides it's breaking, and it decides it's *ours*: it
> matched `source` inside a code span, and mapped it to `demo-app`.
>
> Note what it didn't do. There's a second deprecation on that page, for an endpoint we never
> call. It's listed and ignored. An agent that opens a PR for every deprecation is noise."

### 0:50 — Patch, in a sandbox ⏳

**Show:** the patcher subagent starting, the Daytona sandbox log, `pnpm verify` passing.

> "It hands the change to a patcher subagent — a summary, not the whole page — and that subagent
> opens a Daytona sandbox. The patch is written and the tests run **in there**, not on my
> laptop. That's the point: this is code an LLM just wrote, and it's about to execute.
>
> Smallest possible patch: rename the parameter, update the test that pinned the old name."

### 1:30 — The pull request ⏳

**Show:** the real PR on GitHub. Scroll the description.

> "Real PR, through the GitHub MCP tools. The description has the changelog excerpt, the link to
> the source, why it decided this was breaking, which symbol matched, the diff, and the test
> output. Someone reviewing this doesn't have to go and find the changelog themselves."

### 1:55 — It stops and asks ⏳ **← slow down here**

**Show:** the approval card. Changelog left, diff right. The run paused.

> "And then it stops.
>
> It has a working patch, passing tests, and an open PR — and it will not merge. Merging takes
> an explicit approval. In the code, every irreversible action takes `approved: true` and
> defaults to a dry run, so the safe path is what you get by doing nothing.
>
> That's the whole thesis. The agent does the work. I keep the merge button."

### 2:15 — It remembers ⏳

**Show:** hard-refresh the browser. Still paused, same state.

> "The session persists. I can close this and come back on Monday — the watch is still waiting,
> and it still knows what it found."

### 2:30 — Approve ⏳

**Show:** click Approve → PR merges → it appears in the "Did" panel.

> "Now it merges. And the panel records what it did, so there's a history of every change the
> watch has handled."

### 2:45 — When the vendor changes the *page* ✅

**Run:**
```bash
DEMO_MODE=1 DEMO_FIXTURE=restructured pnpm check
```

**Show:** zero entries extracted, and a repaired selector proposed.

> "Last thing. Vendors redesign their changelog pages, and scrapers silently return nothing.
>
> Here the extraction found zero entries — and the agent treats that as a change event, not an
> error. It re-derives the selectors from the HTML it cached before parsing, checks the new spec
> actually produces valid entries, and opens a PR for the config change. It repairs itself, and
> it still asks."

### 3:00 — Close

**Show:** the architecture diagram in `README.md`.

> "Bright Data for the pages, a Daytona sandbox for the patch, GitHub over MCP for the PR, a
> subagent for the delegation, an approval checkpoint for the merge, and a session that outlives
> the browser. TrueForge gave us all of that; we wrote the watching."

## Rules

- **Say "cached" when it is cached.** The report prints `provenance` and the PR body states it.
  Judges notice, and getting caught costs more than the disclosure.
- If a step fails on camera, say what should have happened and move on. **Do not debug live.**
- Do not narrate architecture over a running demo. Show the doing; explain at the end.

## Fallback (if the harness is down)

Beats 0:00, 0:20 and 2:45 run with no accounts at all — `pnpm demo:seed` then two `pnpm check`
commands. Add `pnpm verify` to show the tests, and show a PR the agent opened earlier in the
day. Narrate honestly which parts are live. `docs/PLAN.md` §6.
