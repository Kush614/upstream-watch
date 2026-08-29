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
./scripts/setup-harness.sh      # configures the harness from .env, idempotently
pnpm --filter pipeline dev      # terminal 2 — scraper runner
pnpm --filter ui dev            # terminal 3 — custom UI on :5173
pnpm demo:seed                  # loads fixtures + seeded breaking change
```

`DEMO_MODE=1` serves cached HTML from `agent/fixtures/` instead of hitting Bright Data.

### Seeing it work

The detection half runs standalone. With Bright Data credentials it scrapes live; without
them, `DEMO_MODE=1` replays the committed capture of the real page:

```bash
pnpm check                                  # live via Bright Data
DEMO_MODE=1 pnpm check                      # replay the committed real capture

pnpm demo:rewind --since 2026-08-20         # forget the latest release
DEMO_MODE=1 pnpm check                      # ...and watch it come back as new
```

Output from the second pair, against Stripe's actual changelog data:

```
stripe — 40/40 entries valid (cache), 21 new
  ⚠ BREAKING · OURS 2026-08-26 — Removes support for specifying payment method types…
      symbols: payment_intents, PaymentIntent#create → demo-app/src/payments.ts
  · breaking elsewhere 2026-08-26 — Adds support for disabling payout methods
      no watched symbol matched — reported, not patched

1 change(s) touch our code and need a patch; 3 other breaking change(s) reported only.
```

Nothing there is invented. Stripe publishes its own `breaking` flag and the exact API
symbols each entry changes; `demo:rewind` only rewinds *our* memory of what we had seen.

### When the vendor redesigns their page

```bash
pnpm demo:break-page                        # same entries, restructured DOM
DEMO_MODE=1 pnpm check                      # SchemaMismatch, not a crash
pnpm repair --vendor stripe                 # build the repair context
pnpm validate-spec --vendor stripe --spec <candidate>   # gate the proposal
pnpm demo:restore-page
```

### The UI

```bash
pnpm demo:feed && pnpm ui                   # three panels on :5173
```

### Status

| Step | State |
| --- | --- |
| Detect — Cloudflare **live via Bright Data**, Stripe from a committed real capture | ✅ 116 tests |
| Self-repair (mismatch → context → validated candidate) | ✅ working; the model proposes the spec |
| PR body + approval gate | ✅ implemented and tested |
| Approval card / Doing / Did panels | ✅ built; wire `adapter.ts` to the harness |
| Sandbox patch + PR + merge | ⏳ needs Daytona and the GitHub MCP connector |

## Demo

The 3-minute script lives in [`docs/DEMO.md`](docs/DEMO.md). The acceptance criteria it has to
hit are in [`CLAUDE.md`](CLAUDE.md) §9.

## Qodo Code Review Evidence

- **Representative PR:** [#2 — feat(pipeline): scrape, parse, diff, relevance, and self-repair](https://github.com/Kush614/upstream-watch/pull/2)
- **What Qodo found / what changed or was dismissed:** 14 findings across [#1](https://github.com/Kush614/upstream-watch/pull/1)–[#3](https://github.com/Kush614/upstream-watch/pull/3), **0 dismissed as invalid**. The one worth reading: this project states in three files that changelog text is untrusted, and `buildPr` quoted the changelog *body* while interpolating the vendor-controlled *title* straight into a Markdown heading — so a title containing newlines could forge sections in a PR a human was about to approve. Also caught partial schema failures silently dropping entries, a corrupt state file being treated as a cold start, and `provenance` defaulting to `fixture` so a live run could publish a PR claiming cached data. All fixed with regression tests.
- **Review history:** each PR carries a finding-by-finding disposition comment and a follow-up Qodo review ([#1](https://github.com/Kush614/upstream-watch/pull/1), [#2](https://github.com/Kush614/upstream-watch/pull/2), [#3](https://github.com/Kush614/upstream-watch/pull/3)). Follow-up counts went 2→1 (the remaining one a false positive, dismissed with evidence), 7→0, 5→0.

Agent-generated PRs — patches and scraper repairs — go through the same flow. That is the
point: the agent's code is held to the bar the humans' code is held to.

## Build log

[`NOTES.md`](NOTES.md) is the running log of everything that broke and how it was fixed. It is
the source for the write-up.

## Add a vendor

1. Add a block to [`agent/targets.yaml`](agent/targets.yaml) — `url`, `schema`, the
   `symbols` you call, and the `files` those symbols can break.
2. Add a matching extraction block to the YAML in
   [`skills/brightdata-changelog-scraper/SKILL.md`](skills/brightdata-changelog-scraper/SKILL.md).
   Use `strategy: css` with an `entry_selector` unless the vendor ships its changelog as
   embedded JSON, as Stripe does.
3. `pnpm scrape --vendor <name>` — the first run baselines silently; the second reports changes.

## Repo layout

See [`CLAUDE.md`](CLAUDE.md) §3 — it is the single source of truth for anyone (human or agent)
working in this repo.

## License

MIT
