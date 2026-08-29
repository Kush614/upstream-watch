# Spec: UI

Track criteria: a stranger could drive it; shows what the agent is doing, what it's waiting on, what it did; asks before the irreversible step.

## Base
`ui/` is a Vite + React app embedding `@truefoundry/trueforge-ui` pointed at `TRUEFORGE_URL`. Stock chat + agent-steps panel come free (streamed reasoning, tool calls, subagents). Do not rebuild these.

## Three panels (layout: chat center, panels right)

### Doing
- Source: `GET /api/v1/sessions/{id}/events` (verified against a running server). SSE per turn
  is at `/turns/{turn_id}/subscribe`; the panel currently polls the session events route.
- Render step list: `skill loaded`, `scrape stripe`, `diff: 1 breaking`, `subagent: patcher`, `sandbox: provisioned (Daytona)`, `tests: pass`, `pr: #12`.
- Sandbox provision shown as a distinct badge — this is a pitch beat.

### Waiting on
- Source: `tool.approval_required` events on the session stream — **approvals are not a REST
  resource**. Answered by posting a `user.tool_approval` item to
  `POST /api/v1/sessions/{id}/turns` with `{"status":"allow"}` or
  `{"status":"deny","reason":"…"}`. All of this lives in `ui/src/adapter.ts`.
- Controls are disabled when there is no live session, so the card cannot look actionable
  while reading the local feed.
- Approval card: left = changelog excerpt (vendor, date, title, ≤ 40 words body, link); right = code diff (syntax-highlighted); footer = test result badge + PR link + **Approve** / **Reject with reason**.
- Card must render identically after a full page refresh (reconnect test).

### Did
- Source: session summary / tool results.
- List of PRs with status (open / merged / draft), vendor, timestamp. Click → GitHub.

## Stranger test
A judge who has never seen it should be able to: click "Check upstream", read the three panels, and press Approve. No config exposed. One primary button per state.

## Scope guard
If by 15:45 panels aren't rendering from live data, ship stock trueforge-ui + the approval card
only (cut order §4). **Status: not needed.** `@truefoundry/trueforge-ui` is published (0.2.4)
and all three panels are built; the remaining work is embedding the stock chat alongside them.
