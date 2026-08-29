# Upstream Watch

> An agent that watches the third-party APIs your code depends on, patches your code when they change, and asks before it merges.

Built for the **Agent Harness Hackathon** (WeMakeDevs × TrueFoundry, Aug 24–30 2026) on
[TrueForge](https://github.com/truefoundry/trueforge), TrueFoundry's open-source agent harness.

## The problem

Your code calls Stripe, Twilio, OpenAI, Slack. Those vendors deprecate parameters, rename
fields, and change response shapes on their own schedule. Nobody on a small team reads every
changelog. You find out when production breaks.

An LLM can *tell you* to go read the changelog. Upstream Watch **does the work**: it reads the
changelog, decides whether the change touches your code, patches the code, runs your tests,
opens a PR — and then stops and waits for you.

## What it does

1. **Watches** — scrapes vendor changelog / deprecation pages through Bright Data on a schedule.
2. **Detects** — diffs against the last seen state and decides whether a change is *breaking*
   and whether it touches a path this repo actually uses (`agent/targets.yaml`).
3. **Patches** — a subagent opens a Daytona sandbox, edits the affected code, runs the tests.
4. **Proposes** — opens a GitHub PR with the changelog excerpt in the description.
5. **Asks** — pauses at a TrueForge approval checkpoint. It never merges on its own.
6. **Remembers** — the session persists, so the watch survives restarts and you can come back
   days later to see what happened.
7. **Repairs itself** — when a vendor changes their *page* rather than their API, the scrape
   fails schema validation; that is treated as a change event, and the agent repairs its own
   extraction spec and opens a PR for it.

## How it uses the harness

| TrueForge capability | Where it shows up here |
| --- | --- |
| MCP tools | GitHub MCP for branches, PRs, merges |
| Sandboxing | Daytona, provisioned only for patch-and-test turns |
| Approvals | The merge gate — the whole point of the project |
| Subagents | Patcher subagent runs in its own context, in its own sandbox |
| Skills | `skills/brightdata-changelog-scraper/SKILL.md`, git-backed |
| Persistent sessions | The watch is long-lived; state survives a browser refresh and a restart |
| Context management | Changelog bodies are summarised before they reach the patcher |

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the diagram, data flow, and trust
boundaries.

```
vendor changelog ──Bright Data──▶ pipeline ──change event──▶ TrueForge agent
                                     │                            │
                                cache raw HTML              patcher subagent
                                (agent/fixtures/html)              │
                                                            Daytona sandbox
                                                          (patch demo-app, test)
                                                                   │
                                                          GitHub MCP ──▶ PR
                                                                   │
                                                          ⏸ APPROVAL GATE
                                                                   │
                                                              merge
```

## Running it

Requires **Node 22+** and `pnpm`.

```bash
cp .env.example .env            # fill keys
pnpm install
npx @truefoundry/trueforge      # terminal 1 — harness on :8790
pnpm --filter pipeline dev      # terminal 2 — scraper runner
pnpm --filter ui dev            # terminal 3 — custom UI on :5173
pnpm demo:seed                  # loads fixtures + seeded breaking change
```

`DEMO_MODE=1` serves cached HTML from `agent/fixtures/` instead of hitting Bright Data.

### Seeing it work without the harness

The detection half runs standalone, no accounts required:

```bash
pnpm demo:seed                                            # cold start
DEMO_MODE=1 DEMO_FIXTURE=breaking   pnpm check            # finds the breaking change
DEMO_MODE=1 DEMO_FIXTURE=restructured pnpm check          # vendor redesigned the page
```

The first prints the seeded breaking change, which symbols matched, and which of our files it
affects. The second prints nothing extracted — and a repaired extraction spec, derived from the
cached HTML and validated before it is proposed.

```
stripe — 5 entries (fixture), 1 new
  ⚠ BREAKING · 2026-08-28 · The `source` parameter on the Charges API is deprecated
      matched `source`, `/v1/charges`, `Charges API` → demo-app/src
```

### Status

| Step | State |
| --- | --- |
| D1 detect | ✅ working, 39 tests |
| D2 patch in a sandbox | ⏳ needs Daytona configured |
| D3 PR via GitHub MCP | ⏳ PR body built and tested; needs the MCP connector |
| D4 approval gate | ✅ gate implemented and tested · ⏳ needs harness wiring |
| D5 session persistence | ⏳ harness |
| D6 approve → merge | ⏳ harness |
| D7 self-repair | ✅ detection + repair working · ⏳ PR for the spec change |

## Demo

The 3-minute script lives in [`docs/DEMO.md`](docs/DEMO.md). The acceptance criteria it has to
hit are in [`CLAUDE.md`](CLAUDE.md) §9.

## Qodo Code Review Evidence

Every change to this repo goes through a pull request, and every PR is reviewed by Qodo before
it merges. Direct pushes to `main` are a non-negotiable in [`CLAUDE.md`](CLAUDE.md) §2.

**Representative PR: [#2 — feat(pipeline): scrape, parse, diff, relevance, and self-repair](https://github.com/Kush614/upstream-watch/pull/2)**

| PR | What Qodo found | What we did |
| --- | --- | --- |
| [#1](https://github.com/Kush614/upstream-watch/pull/1) | 2 bugs: a `targets.yaml` reference to a file that did not exist yet, and `amountCents <= 0` letting `1.5`, `NaN` and `Infinity` reach Stripe | Both fixed. Moved the extraction spec into the PR that owns the fixtures it describes; `amountCents` now requires a positive integer. 5 → 9 tests |
| [#2](https://github.com/Kush614/upstream-watch/pull/2) | 7 bugs, incl. partial schema failures silently dropping entries, a corrupt state file being treated as a cold start, and **vendor-controlled titles injecting Markdown into the PR body** | All 7 fixed, each with a regression test. 34 → 49 tests |
| [#3](https://github.com/Kush614/upstream-watch/pull/3) | 5 bugs, incl. `provenance` defaulting to `fixture` so a live run could publish a PR claiming cached data, and a patcher prompt that forbade reading the test it was required to update | 3 fixed here, 2 fixed further down the stack where the code lives |

**14 findings, 0 dismissed.** Every one was real. The one worth reading is
[#2's Markdown injection](https://github.com/Kush614/upstream-watch/pull/2): this project states
in three separate files that changelog text is untrusted data, and `buildPr` carefully quoted the
changelog *body* while interpolating the vendor-controlled *title* straight into a Markdown
heading — so a title containing newlines could forge sections in a PR a human was about to
approve. Our tests all passed, because they were written by the same mind that wrote the bug.

The full write-up is in [`NOTES.md`](NOTES.md). Each PR carries a comment with the finding-by-
finding disposition and the reasoning, per [`specs/qodo-workflow.md`](specs/qodo-workflow.md).

## Build log

[`NOTES.md`](NOTES.md) is the running log of everything that broke and how it was fixed. It is
the source for the write-up.

## Repo layout

See [`CLAUDE.md`](CLAUDE.md) §3 — it is the single source of truth for anyone (human or agent)
working in this repo.

## License

MIT
