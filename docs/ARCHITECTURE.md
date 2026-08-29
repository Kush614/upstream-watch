# Architecture

## One-line
Bright Data (live web) → change detection → TrueForge agent loop → Daytona sandbox (patch + test) → GitHub PR → **human approval** → merge. Sessions persist throughout.

## Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UI  (@truefoundry/trueforge-ui + custom panels)                         │
│  [Doing: streamed steps] [Waiting on: approval card] [Did: PR list]      │
└──────────────▲───────────────────────────────▲───────────────────────────┘
               │ SSE                            │ approve / reject
┌──────────────┴───────────────────────────────┴───────────────────────────┐
│  TrueForge server  (:8790)  — agent loop, sessions (SQLite), approvals   │
│                                                                          │
│   Orchestrator agent                                                     │
│     ├── skill: brightdata-changelog-scraper (SKILL.md)                   │
│     ├── subagent: watcher   (one per vendor in targets.yaml)             │
│     ├── subagent: patcher   (sandbox: clone, patch, test)                │
│     └── approval checkpoint: "merge PR"                                  │
└───────┬────────────────────┬────────────────────┬────────────────────────┘
        │ CLI / MCP          │ sandbox tool       │ MCP (OAuth)
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│ Bright Data   │    │ Daytona       │    │ GitHub        │
│ Scraper Studio│    │ sandbox       │    │ MCP server    │
│ (live pages)  │    │ (patch+test)  │    │ (PR, merge)   │
└───────┬───────┘    └───────────────┘    └───────────────┘
        │ raw HTML cached first
┌───────▼──────────────────────────┐
│ pipeline/  (TS)                  │
│  scrape → cache → parse → schema │
│  validate → diff vs last run     │
│  → on mismatch: self-repair      │
└──────────────────────────────────┘
```

## Components

### 1. `pipeline/` — data layer (Bright Data track)
- `scrape.ts` — wraps the Bright Data Web Unlocker API (`POST https://api.brightdata.com/request`,
  `{zone, url, format: "raw"}`). Always writes raw HTML to
  `agent/fixtures/html/<vendor>/<ts>.html` before parsing; keeps the newest 5, plus
  `current.html` and `last-good.html`.
- `parse.ts` — applies the extraction spec → `ChangelogEntry[]`, validates against
  `schemas/changelog-entry.json`. Two strategies: `css` (selectors) and `embedded-json`, for
  vendors like Stripe that server-render entries into a script rather than into markup.
- `diff.ts` — compares to `state/<vendor>.last.json`; emits `ChangeEvent[]` (new entries, entries flagged `breaking`).
- `repair.ts` — on schema mismatch / zero results: asks model to propose new extraction spec using cached HTML + last good HTML; validates against cache; opens PR on `skills/…/SKILL.md` with new spec. See `specs/scraper-pipeline.md`.
- `state/` — last-known entries per vendor (committed for demo reproducibility).

### 2. TrueForge agent — orchestration layer (Harness track)
- Saved agent "Upstream Watch" in Agents Library with instructions from `agent/prompts/orchestrator.md`.
- **Skills:** `brightdata-changelog-scraper` (git-backed, imported via Settings → Skills).
- **Connectors:** GitHub MCP (OAuth).
- **Sandbox:** Daytona; provisioned only in patcher turns.
- **Subagents:** dynamic; watcher per vendor (parallel), patcher per change event.
- **Approval:** configured per MCP server via `MCPServerApprovalToolSelector` — we gate the
  tool `merge_pull_request` by name, so opening a PR stays ungated. A pending approval arrives
  as a `tool.approval_required` event on `GET /api/v1/sessions/{id}/events` and is answered
  with a `user.tool_approval` item posted to `POST /api/v1/sessions/{id}/turns`. Verified
  against a running server, 2026-08-30.
- **Sessions:** the watch session is long-lived; user returns and asks "what changed since I left?".

### 3. Sandbox contract — `specs/patcher.md`
Input: repo URL, change event, affected files (from `targets.yaml` mapping). Output: diff, test results, PR body. Never merges.

### 4. `ui/` — UI track
React app embedding `@truefoundry/trueforge-ui`, consuming server SSE. Two custom panels described in `specs/ui.md`. Approval card renders changelog excerpt + code diff side by side.

### 5. `demo-app/` — the victim
97-line Express app at `demo-app/src/payments.ts` calling Stripe's Charges API. 14 tests, so
"tests pass" means something. A second vendor is cut #1 in `docs/PLAN.md` and stays uncut until
the loop is green.

## Data flow for one change event
1. Watcher subagent runs skill → `pipeline/scrape` → cached HTML → parse → diff → `ChangeEvent{vendor, entry, breaking:true}`.
2. Orchestrator maps `entry` to code paths via `targets.yaml` (`stripe → demo-app/src/payments.ts`).
3. Patcher subagent requests sandbox → clones repo → applies fix → runs `pnpm test` → returns diff + results.
4. Orchestrator opens PR via GitHub MCP. PR body = changelog excerpt + rationale + test output.
5. Orchestrator hits approval checkpoint for merge. Session pauses. UI shows card.
6. Human approves → merge. "Did" panel updates. Session continues watching.

## Trust boundaries / basic security
- Agent-written code runs only in Daytona, never on host.
- GitHub token held by TrueForge, not in `.env`. Note the connector is **header-PAT auth, not
  OAuth** — the catalog entry `github` points at `https://api.githubcopilot.com/mcp/`.
- Bright Data key only in pipeline process env.
- Local TrueForge stays on localhost (no auth in local mode).
- Irreversible actions (merge) gated by approval; everything else is dry-run by default.

## Why sandbox-as-tool matters here (say this to the harness judge)
Watch turns are cheap: no sandbox. Only when a breaking change is found does a sandbox spin up. One server, many vendors, minimal cost. This is the design TrueForge advocates and the demo shows it.
