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

<!-- REQUIRED for the Code Quality track. Fill this in as PRs merge — see specs/qodo-workflow.md.
     The public PR link is the required proof; screenshots cannot replace it. -->

| PR | What Qodo found | What we did |
| --- | --- | --- |
| _TBD_ | _TBD_ | _TBD_ |

**Representative merged PR:** _TBD — link here_

## Build log

[`NOTES.md`](NOTES.md) is the running log of everything that broke and how it was fixed. It is
the source for the write-up.

## Repo layout

See [`CLAUDE.md`](CLAUDE.md) §3 — it is the single source of truth for anyone (human or agent)
working in this repo.

## License

MIT
