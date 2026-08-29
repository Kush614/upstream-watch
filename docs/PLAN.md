# PLAN — build day, Sun 30 Aug 2026

**Submission: 18:00.** Everything in this file is written backwards from that deadline.

This is the file `CLAUDE.md` §10 says to check before building anything. If a task is not on
the demo path below, it does not get built today. Read §2 (Demo path), then §4 (hour-by-hour),
then §6 (Cut order). The rest is reference.

---

## 1. What we are being judged on

From the hackathon brief, in priority order for this project:

| Track | Prize | What the judges look for | Our evidence |
| --- | --- | --- | --- |
| **Double-O (primary)** | NVIDIA DGX Spark | Best use of TrueForge: *real* MCP tools, sandboxed execution, human approvals, subagents, persistent sessions | The whole demo path — every one of those five is load-bearing, not decorative |
| **Q Branch** | Mac Mini | Best code quality; **Qodo required** | Every merge is a Qodo-reviewed PR; README evidence section |
| **Field Report** | Keychron | Best blog post | `NOTES.md`, written as we go |
| **Universal Exports** | TF interview | Top projects overall | — |
| **Calling Card** | MX Master 3 | Star the TrueForge repo | 60-second task, in preflight |

The single most important sentence in the brief: *"the agent should be doing work, not simply
generating an answer."* Every demo beat has to show the agent **doing**, not describing.

Bright Data is a sponsor tool we lean on, but the harness is the primary track — if a trade-off
appears between "more Bright Data" and "more harness", harness wins.

---

## 2. The demo path

This is the spine. It is `CLAUDE.md` §9 restated as build order, with each step named so the
hour-by-hour plan and the cut order can refer to it.

| # | Step | Depends on | Proves |
| --- | --- | --- | --- |
| **D1** | Agent session starts, scrapes cached Stripe changelog, finds the seeded breaking change | fixtures, pipeline, skill | Bright Data + skills |
| **D2** | Patcher subagent opens a Daytona sandbox, patches `demo-app/`, tests pass | D1, sandbox configured | Subagents + sandboxing |
| **D3** | PR opened on GitHub with the changelog diff in the description | D2, GitHub MCP | Real MCP tools |
| **D4** | UI shows an approval card (changelog excerpt + code diff); run is **paused** | D3, ui panels | **Approvals — the thesis** |
| **D5** | Refresh the browser → still paused, state intact | D4 | Persistent sessions |
| **D6** | Approve → PR merges; "Did" panel lists it | D5 | The gate actually gates |
| **D7** | `DEMO_MODE=0`, break the fixture page structure → detect, self-repair, keep flowing | D1, live Bright Data | Resilience; the surprise beat |

**D4 is the project.** If the day goes badly, the thing that must survive is: *a real change was
detected, real code was patched, a real PR exists, and the agent stopped and asked.*

Anything not in this table is out of scope until all seven work. That includes: multi-vendor
support, scheduling/cron, auth, deployment, a landing page, and every "wouldn't it be cool if".

---

## 3. Preflight — Sat 29 Aug (tonight, ~60–90 min)

Do these **tonight**. Each one is a thing that can silently eat an hour tomorrow morning.
Tick them off in this file and commit it.

- [ ] `npx @truefoundry/trueforge` boots; http://localhost:8790 loads. Note the version.
- [ ] **Model provider** configured (Settings → Models), a trivial chat completes.
- [ ] **GitHub MCP** connected via OAuth (Settings → Connectors). Ask the agent to list your
      repos — confirm the tool actually fires. Record the **exact server + tool names** in
      `specs/agent.md` (`CLAUDE.md` §4 flags this as unverified).
- [ ] **Daytona** API key created and saved (Settings → Sandbox providers). Ask the agent to
      run `echo hi` in a sandbox. **This is the highest-risk item** — an unconfigurable sandbox
      kills D2 and there is no workaround that still scores the sandboxing criterion.
- [ ] **Bright Data**: account live, `BRIGHTDATA_API_KEY` + zone known. Run one scrape of the
      real Stripe changelog from the terminal and **paste the working command into
      `CLAUDE.md` §6** where the TODO is. Save the raw HTML into `agent/fixtures/html/`.
- [ ] **Qodo** GitHub app installed on this repo; open a throwaway PR and confirm it reviews.
      If it does not respond, comment `/agentic_review`. Do not discover this at 16:00.
- [ ] GitHub repo created and pushed. Before making it **public**: confirm `.env` is ignored
      and has never been committed, and grep the full history *and* the tracked tree for the
      literal secret values (not the placeholder text). Only then flip it public.
- [ ] Star https://github.com/truefoundry/trueforge (Calling Card track, 60 seconds).
- [ ] Read `specs/*.md` stubs and fill in anything you already know.
- [ ] Sleep. A rested builder is worth two hours of the plan.

**Rule for tonight:** if something does not work in 20 minutes, stop, write it in `NOTES.md`,
and move to the next item. Tonight is for *discovering* blockers, not fixing them.

---

## 4. Build day — hour by hour

Times assume an **08:00 start**. If you start later, the cut order in §6 is not optional —
apply it from the top immediately, and drop the same number of hours off the end.

### 08:00–08:30 — Cold start check (30m)

Re-run every preflight tick. Things rot overnight: tokens expire, `npx` pulls a new version.
Get a green board before writing a line of code. Anything red → `NOTES.md`, then decide
whether it is on the demo path (fix it) or not (cut it).

### 08:30–09:30 — H1: fixtures + the victim (D1 groundwork) → `feat/demo`

The only hour where you write code with no dependencies. Do it first while fresh.

- `demo-app/` — a tiny TS app that calls the watched API. Small enough to read on a projector,
  real enough that a patch to it is obviously a real patch. One file, one function, one test.
- `agent/fixtures/html/stripe-changelog.html` — the real page saved tonight.
- `agent/fixtures/html/stripe-changelog-breaking.html` — the same page **plus one seeded
  breaking entry** that deprecates the exact parameter `demo-app/` uses.
- `agent/targets.yaml` — Stripe entry mapping the vendor page to `demo-app/src/…`.

**Done when:** `demo-app` tests pass, and the two fixtures differ by exactly one entry.
**PR:** `feat(demo): victim app + Stripe changelog fixtures`

### 09:30–11:00 — H2: pipeline core (D1) → `feat/pipeline`

- `pipeline/src/clients/brightdata.ts` — real client + fixture-backed fake, chosen by
  `DEMO_MODE`. Fake first; the real one only has to work by H7.
- `pipeline/src/lib/parse.ts` — HTML → `ChangelogEntry[]`, validated against
  `schemas/changelog-entry.json`.
- `pipeline/src/lib/diff.ts` — last-seen vs now → new entries; classify `breaking`; match
  against `targets.yaml` to decide *relevant to us*.
- Vitest over the fixtures. **No network in tests** (`CLAUDE.md` §7).

**Done when:** `pnpm --filter pipeline test` proves the seeded entry is detected as breaking and
mapped to a `demo-app` path, and the clean fixture produces zero events.
**PR:** `feat(pipeline): scrape, parse, diff, relevance matching`

> This is the hour most likely to overrun — parsing real-world HTML always takes longer than it
> looks. **Hard stop at 11:00.** If parsing is not done, hardcode the fixture parse and move on;
> the demo does not care how the entry was extracted, only that it was.

### 11:00–12:15 — H3: the agent (D1 end to end) → `feat/agent`

- `skills/brightdata-changelog-scraper/SKILL.md` — fill it in properly; it is git-backed and
  the judges can read it.
- `agent/prompts/system.md` — the watch loop, the approval rule, the tone.
- `agent/prompts/patcher.md` — the subagent contract from `specs/patcher.md`.
- Compose the agent in TrueForge: model + GitHub MCP + skill + subagents + sandbox. **Save it**
  so it appears in the Agents Library (this is what "a reusable agent" means to the judges).

**Done when (D1):** a fresh session, given no arguments, scrapes the cached page and reports the
seeded breaking change and which file it affects.

### 12:15–12:45 — Lunch + buffer (30m)

Actually eat. This slot is also the overflow for H2/H3. If you are on time, use it to write the
`NOTES.md` entries you have been putting off while they are still fresh.

### 12:45–14:00 — H4: patcher subagent + sandbox (D2) → `feat/agent`

- Subagent gets: changelog excerpt (summarised, not the whole page), target file, the diff
  contract from `specs/patcher.md`.
- It opens a Daytona sandbox, applies the patch, runs `pnpm --filter demo-app test`, and returns
  a structured result: `{ patched: boolean, diff: string, testsPassed: boolean, log: string }`.
- Failure path matters for the demo's credibility: if tests fail, it does **not** open a PR — it
  reports and stops.

**Done when (D2):** sandbox log visible in the session, `demo-app` patched, tests green.

### 14:00–15:00 — H5: PR + approval gate (D3, D4) → `feat/agent`

The most important hour of the day. Two beats, both non-negotiable.

- GitHub MCP: branch, commit the patch, open the PR. Description = changelog excerpt + source
  URL + the diff. A judge should be able to read the PR alone and understand what happened.
- Then **stop**. Register the TrueForge approval checkpoint before merge. Per `CLAUDE.md` §2.3
  and §7, the merge function takes `{ approved: true }` and defaults to dry-run.

**Done when (D3, D4):** a real PR exists on GitHub and the run is visibly paused waiting on a
human. Merge only fires after approval (D6 in the stock UI is fine at this point).

### 15:00 — ⏱ CHECK-IN 1 · **the go/no-go**

D1–D4 must all be green. If they are not, **start cutting from §6 now** — not at 16:00, when
cutting no longer buys you anything. Be honest here; this is the check-in the whole plan is
built around.

### 15:00–16:00 — H6: UI panels + persistence (D5, D6) → `feat/ui`

Only start this if the 15:00 check-in was green.

- `ui/` embeds `@truefoundry/trueforge-ui`.
- Panel 1 — **approval card**: changelog excerpt on the left, code diff on the right, Approve /
  Reject. The screenshot that goes in the submission.
- Panel 2 — **"Did" panel**: what the watch has done, PRs opened, what is awaiting approval.
- **Test D5 for real:** hard-refresh mid-approval. Still paused → persistent sessions proven.

### 15:45 — ⏱ CHECK-IN 2

Is the UI going to land by 16:00? If not, cut it (§6 item 4) and take the stock TrueForge
approval UI. A stock approval that works beats a custom panel that half-renders.

### 16:00–16:30 — H7: self-repair (D7)

The surprise beat. `DEMO_MODE=0`, break the fixture's page structure (rename the entry
container class), watch the scrape return zero entries, and watch the agent treat that as a
**change event** rather than an error: repair the extraction spec, re-run against cached HTML,
then live, and open a PR for the spec change (`CLAUDE.md` §6).

Timeboxed hard. It is the first thing cut and the last thing added.

### 16:30 — ⏱ CHECK-IN 3 · **feature freeze**

**No new features after this point.** Whatever works, works. From here it is rehearsal,
documentation, and submission. Breaking the demo at 17:00 to add one more thing is the single
most common way hackathon projects lose.

### 16:30–17:15 — H8: rehearse twice, cold, and write the README

- Full run from a cold start, `DEMO_MODE=1`, stopwatch running. Target: **under 4 minutes**.
- Second run, fixing only what broke in the first. If a step is flaky, cut it rather than
  praying it works on camera.
- README: **Qodo Code Review Evidence** section — link the representative merged PR, 1–2 lines
  on what Qodo found and what you changed or dismissed and why. The public PR link is the
  required proof. Do not skip this: it is the entire Q Branch track.
- `docs/DEMO.md` gets the final verbatim script.

### 17:15 — ⏱ CHECK-IN 4

Recording starts now regardless of state. A rough recording submitted beats a perfect one that
misses 18:00.

### 17:15–17:45 — H9: record

Follow `docs/DEMO.md` verbatim. Do not improvise; do not explain the architecture over the top
of a running demo — show the seven beats. If a take fails past the halfway mark, keep it as the
fallback and start one more. Two takes maximum.

### 17:45–18:00 — H10: submit

Submit at **17:50**, not 17:59. Links: repo, video, blog draft, the representative Qodo PR.
Confirm the repo is public and the video is not set to private — the two classic ways a good
project scores zero.

---

## 5. Check-in protocol

`CLAUDE.md` §9 mandates check-ins every 45 minutes after 15:00: **15:00, 15:45, 16:30, 17:15**.

At each one, answer in `NOTES.md`, in writing, in under two minutes:

1. Which demo steps (D1–D7) are green *right now*, demonstrated end to end — not "nearly"?
2. What is the next thing that must go green, and is it on the demo path?
3. Given the clock, do I cut? If yes, cut the top uncut item in §6 **now**.

The reason this is written down: at 16:00 with adrenaline up, everything feels achievable. The
plan is smarter than the builder is at 16:00.

---

## 6. Cut order

From the spec bundle. **Cut from the top**; the ordering is the author's, chosen so each cut
costs the fewest judging points per hour recovered.

| # | Cut | Status today |
| --- | --- | --- |
| 1 | Second vendor → Stripe only | already the case |
| 2 | Dynamic subagents → one agent doing watcher + patcher sequentially | available |
| 3 | Live self-repair → pre-recorded clip + cached repaired spec | detection + gate work offline, so this is cheap to keep |
| 4 | Custom UI panels → stock `trueforge-ui` | **no longer needed** — panels are built and `trueforge-ui` is published |
| 5 | Reconnect demo | 10 seconds; keep |

### Never cut

- **The approval gate** — the thesis.
- **A real GitHub PR** via the GitHub MCP connector.
- **A Qodo review on that PR** — the Q Branch track, unreconstructable after the fact.
- **Cached demo mode** — the "everything on fire" fallback. `DEMO_MODE=1` replays the
  committed real capture.

### If it is 17:00 and nothing works

`pnpm demo:rewind && DEMO_MODE=1 pnpm check` shows real Stripe breaking changes mapped to
real files, `pnpm demo:break-page` shows the mismatch-and-repair path, and `pnpm demo:feed &&
pnpm ui` shows the approval card. All three run with no accounts at all. Narrate honestly
which parts are live.

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Daytona sandbox will not provision | Med | **Kills D2** | Verify tonight. No good fallback — this is why it is the first preflight item after the harness |
| GitHub MCP tool names differ from the docs | Med | Blocks D3 | Verify tonight, record exact names in `specs/agent.md` |
| Bright Data CLI flags differ from expectation | High | Blocks D7, not D1–D6 | Cached-HTML path is the default; live is cut #7 |
| Real changelog HTML is hostile to parse | High | Eats H2 | Hard stop at 11:00, hardcode the fixture parse |
| Qodo does not review the PR | Low | **Kills Q Branch** | Verify tonight; `/agentic_review` to force |
| The agent merges without asking | Low | Kills the thesis | `{ approved: true }` default-dry-run (`CLAUDE.md` §7); test the *rejection* path too |
| Model rate limits mid-demo | Med | Ugly on camera | Rehearse on the same account; have the Anthropic fallback key configured |
| Time sink: making the UI pretty | **High** | Eats D7 + rehearsal | Feature freeze at 16:30, enforced by check-in 3 |

---

## 8. Open questions

Answered today:

1. ~~GitHub MCP server name~~ — still open. The one remaining blocker for D3.
2. ~~TrueForge local mode API key~~ — not needed for the panels; `adapter.ts` talks to
   `/api/v1/...` unauthenticated on localhost.
3. ~~Bright Data CLI command~~ — **answered.** `POST https://api.brightdata.com/request`
   with `{zone, url, format: "raw"}` and a Bearer token. Recorded in `CLAUDE.md` §6 and
   implemented in `pipeline/src/clients/brightdata.ts`.
4. ~~Is `@truefoundry/trueforge-ui` embeddable standalone?~~ — **answered: yes.** Published
   at 0.2.4. Cut #4 is off the table.
5. ~~How are approval checkpoints declared?~~ — **partly answered.** `trueforge-ui` exports
   `useTrueFoundryRespondToToolApproval`, `ToolApprovalBar` and `ApprovalDecision`. The
   remaining unknown is the REST route that lists *pending* approvals, isolated in
   `ui/src/adapter.ts`.
6. Does a saved agent's session survive a full harness restart, or only a browser refresh?
   Still open. `docs/DEMO.md` claims the former — weaken the claim if it turns out to be false.

Still unverified, in priority order:

- **Daytona sandbox provisioning.** No fallback that still scores the sandboxing criterion.
- **GitHub MCP server + tool names** in the connector catalog.
- **The pending-approvals route** in `/api/v1/docs`.
