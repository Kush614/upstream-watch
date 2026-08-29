# DEMO — the 3-minute script

> Status: **skeleton**. Written verbatim during H8 (`docs/PLAN.md` §4), after two cold
> rehearsals. Do not improvise on camera; read this.

**Target: under 4 minutes from cold start** (`CLAUDE.md` §9). Aim the spoken script at 3:00 to
leave slack.

## Before recording

- [ ] `DEMO_MODE=1`
- [ ] Harness running, agent saved in the Agents Library, no session open
- [ ] `demo-app` on a clean checkout, unpatched, tests green
- [ ] Previous demo PRs closed so the new one is unambiguous
- [ ] Browser zoom up; terminal font up; notifications off
- [ ] Stopwatch visible to you, not to the camera

## The beats

| Time | Beat | What is on screen | What you say |
| --- | --- | --- | --- |
| 0:00 | **The problem** | `demo-app/src` — the call to the vendor API | _TBD — one sentence. "This code calls Stripe. Stripe is about to break it, and nobody on this team reads the changelog."_ |
| 0:20 | **D1 — detect** | Session starts, agent scrapes, reports the breaking entry | _TBD_ |
| 0:50 | **D2 — patch in a sandbox** | Subagent + Daytona log, tests green | _TBD — name the sandbox out loud; it is a scored capability_ |
| 1:30 | **D3 — the PR** | Real GitHub PR, changelog excerpt in the body | _TBD_ |
| 1:55 | **D4 — it stops and asks** | Approval card: changelog left, diff right | _TBD — **this is the thesis. Slow down here.**_ |
| 2:15 | **D5 — persistence** | Hard-refresh the browser; still paused | _TBD — "days later, same state"_ |
| 2:30 | **D6 — approve** | Approve → merge → "Did" panel | _TBD_ |
| 2:45 | **D7 — self-repair** | Break the page structure; agent repairs its own extraction | _TBD — cut first if short on time_ |
| 3:00 | **Close** | Architecture diagram | _TBD — one sentence on what the harness gave us for free_ |

## Rules

- Say **"cached"** when it is cached. Do not imply live scraping if `DEMO_MODE=1`. Judges
  notice, and honesty costs less than getting caught.
- If a step fails on camera, say what should have happened and move on. Do not debug live.
- Do not narrate the architecture over a running demo. Show the doing; explain at the end.

## Fallback (if it breaks mid-recording)

`docs/PLAN.md` §6 "If it is 17:00 and nothing works" — terminal pipeline run on fixtures, the
PR the agent opened earlier, the approval card, honestly narrated.
