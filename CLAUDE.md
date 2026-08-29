# Upstream Watch — CLAUDE.md

> An agent that watches the third-party APIs your code depends on, patches your code when they change, and asks before it merges.

This file is the single source of truth for Claude Code (and any coding assistant) working in this repo. Read it fully before touching code. If something here conflicts with a file in `specs/`, the spec wins and this file must be updated in the same PR.

## 1. Project in one paragraph

Upstream Watch is a TrueForge agent. It scrapes vendor changelog / deprecation pages via Bright Data on a schedule, detects breaking changes relevant to this repo's dependencies, spins up a Daytona sandbox to patch the affected code and run tests, opens a GitHub PR, and **pauses for human approval before merge**. Sessions persist, so the watch survives restarts and the user can come back days later to see what happened.

Hackathon: Agent Harness Hackathon (WeMakeDevs × TrueFoundry), build day Aug 30 2026, submission 18:00.
Tracks: Harness (primary), Bright Data, Code Quality (Qodo), UI, Blog.

## 2. Non-negotiables

1. **No direct pushes to `main`.** Every change is a branch + PR + Qodo review. Qodo rejects unreviewed merges for the Code Quality track.
2. **Demo path first.** Nothing gets built that isn't on the path in `docs/PLAN.md` until the demo works end to end.
3. **Approval gate is sacred.** The agent never merges, deletes, or writes to a live store without a TrueForge approval checkpoint.
4. **Scraper config lives here, not in a dashboard.** See §6. If you change a scraper setting in the Bright Data UI, mirror it here in the same commit.
5. **Log failures to `NOTES.md`** every time something breaks. That file becomes the blog post.
6. **Secrets never in code.** `.env` only, `.env.example` committed.

## 3. Repo layout

```
upstream-watch/
├── CLAUDE.md                  ← you are here
├── NOTES.md                   ← running log of what broke (blog source)
├── README.md                  ← architecture diagram, demo script, Qodo evidence section
├── .env.example
├── docs/
│   ├── ARCHITECTURE.md        ← systems, data flow, trust boundaries
│   ├── PLAN.md                ← hour-by-hour build plan + cut order
│   ├── DEMO.md                ← the 3-minute demo script, verbatim
│   └── PITCH.md               ← 90-second pitch
├── specs/
│   ├── agent.md               ← agent instructions, tools, subagents, approvals
│   ├── scraper-pipeline.md    ← Bright Data pipeline, change detection, self-repair
│   ├── patcher.md             ← sandbox patch-and-test contract
│   ├── ui.md                  ← custom panels on top of @truefoundry/trueforge-ui
│   └── qodo-workflow.md       ← PR / review / evidence process
├── skills/
│   └── brightdata-changelog-scraper/
│       └── SKILL.md           ← git-backed TrueForge skill; also the Bright Data "rules file"
├── agent/
│   ├── targets.yaml           ← which vendors/pages to watch, mapped to code paths
│   ├── prompts/               ← system + subagent prompts, one file each
│   └── fixtures/              ← cached HTML + seeded "breaking change" for demo mode
├── pipeline/                  ← scraper runner, diff, self-repair (TypeScript)
├── ui/                        ← React app embedding trueforge-ui + custom panels
└── demo-app/                  ← tiny app that calls the watched APIs (the "victim" code)
```

## 4. Stack

- **Harness:** TrueForge local mode — `npx @truefoundry/trueforge` → http://localhost:8790. Node 22+. SQLite.
- **Model:** OpenAI (hackathon credits) via TrueForge Settings → Models. Fallback: Anthropic key if configured.
- **Tools (MCP):** GitHub MCP via OAuth (Settings → Connectors). VERIFY exact server name in catalog.
- **Sandbox:** Daytona (Settings → Sandbox providers). Sandbox is provisioned only for patch+test turns.
- **Web data:** Bright Data Scraper Studio, driven from the terminal. Config in `skills/brightdata-changelog-scraper/SKILL.md`.
- **API/SDK:** TrueForge HTTP API (REST + SSE, docs at `http://localhost:8790/api/v1/docs`), `@truefoundry/trueforge-core` (TS SDK).
- **UI:** `@truefoundry/trueforge-ui` embedded in `ui/`, plus two custom panels (see `specs/ui.md`).
- **Review:** Qodo GitHub app on this repo. `/agentic_review` to trigger manually.
- **Language:** TypeScript everywhere. `pnpm`. Vitest for tests.

## 5. How to run

```bash
cp .env.example .env            # fill keys
pnpm install
npx @truefoundry/trueforge       # terminal 1 — harness on :8790
pnpm --filter pipeline dev       # terminal 2 — scraper runner
pnpm --filter ui dev             # terminal 3 — custom UI on :5173
pnpm demo:seed                   # loads fixtures + seeded breaking change
```

Demo mode: `DEMO_MODE=1` makes the pipeline serve cached HTML from `agent/fixtures/` instead of hitting Bright Data. Always rehearse with this ON first, then OFF.

## 6. Bright Data scraper settings (rules for the coding assistant)

These settings are reused automatically by Claude Code. Do not ask the user for them.

```yaml
# Bright Data — Scraper Studio
provider: brightdata
tool: scraper-studio            # driven via CLI, never via dashboard during the day
auth: env:BRIGHTDATA_API_KEY
zone: env:BRIGHTDATA_ZONE       # VERIFY zone name from Bright Data setup
output: json
schema: schemas/changelog-entry.json   # {vendor, date, title, body, url, breaking: bool}
retry: 3
on_schema_mismatch: repair      # see specs/scraper-pipeline.md §4
cache_dir: agent/fixtures/html
targets_file: agent/targets.yaml
```

Rules:
- Every scrape writes raw HTML to `cache_dir` before parsing. Never parse without caching.
- A scrape that returns 0 entries or fails schema validation is a **change event**, not an error. Trigger self-repair.
- Self-repair edits the extraction spec, re-runs against cached HTML, and only then against live. It opens a PR for the spec change; it does not silently mutate config.
- CLI invocation and flags: VERIFY against Bright Data getting-started doc and record the working command here:
  `# TODO: paste working command, e.g. brightdata scrape --zone $ZONE --url <url> --schema schemas/changelog-entry.json`

## 7. Coding conventions

- One concern per file. Prompts are `.md` files in `agent/prompts/`, never inline strings.
- Every external call (Bright Data, GitHub, TrueForge API) goes through a client in `pipeline/clients/` with typed responses and a fixture-backed fake for tests.
- Functions that take an irreversible action must accept `{ approved: true }` explicitly; default is dry-run.
- Errors: throw typed errors; top-level handlers log to `NOTES.md` in demo/dev.
- Tests: every PR touching `pipeline/` adds or updates a Vitest test using fixtures. No network in tests.
- Commit messages: `feat|fix|chore|docs(scope): summary`. PR titles the same.

## 8. Git workflow (solo, still disciplined)

```
main            ← only via merged, Qodo-reviewed PRs
feat/pipeline   ← scraper + diff + repair
feat/agent      ← TrueForge agent config, prompts, skill
feat/ui         ← trueforge-ui embed + panels
feat/demo       ← fixtures, seed, demo script
```
Keep PRs under ~300 lines. Merge often. After Qodo review: fix High, judge Medium/Low, dismiss with a reason in-thread.

## 9. Definition of "demo works"

All of the following, from a cold start, in under 4 minutes, with DEMO_MODE=1:
1. Agent session starts, scrapes (cached) Stripe changelog, finds seeded breaking change.
2. Subagent opens Daytona sandbox, patches `demo-app/`, tests pass.
3. PR opened on GitHub with changelog diff in the description.
4. UI shows approval card with changelog excerpt + code diff; run is paused.
5. Refresh the browser → run still paused, state intact.
6. Approve → PR merges. "Did" panel lists it.
7. Flip DEMO_MODE=0, break the fixture page structure → pipeline detects, repairs, keeps flowing.

If any step fails at the 45-minute check-ins after 15:00, cut scope per `docs/PLAN.md` §Cut order.

## 10. What Claude Code should do when asked to "build X"

1. Check `docs/PLAN.md` — is X on the demo path? If not, say so and ask.
2. Read the relevant `specs/*.md`.
3. Create a branch, implement, add a fixture-backed test, open PR, run Qodo.
4. Append anything that broke to `NOTES.md`.
