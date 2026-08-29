# SPEC — UI

> Status: **skeleton**. Cut #3/#4 in `docs/PLAN.md` §6 — if this slips past 15:45, fall back to
> the stock TrueForge approval UI. **A stock approval that works beats a custom panel that
> half-renders.**

`ui/` embeds `@truefoundry/trueforge-ui` and adds two panels.

## Panel 1 — Approval card (**required**)

The screenshot that goes in the submission. This is D4, the thesis of the project.

```
┌────────────────────────────────────────────────────────────┐
│  Stripe · 2026-08-28 · BREAKING                            │
├───────────────────────────────┬────────────────────────────┤
│  CHANGELOG                    │  PROPOSED PATCH            │
│  "The `foo` parameter is      │  - api.charge({ foo: 1 })  │
│   deprecated and will be      │  + api.charge({ bar: 1 })  │
│   removed..."                 │                            │
│   ↗ source                    │  ✓ demo-app tests pass     │
├───────────────────────────────┴────────────────────────────┤
│  PR #12 ↗                            [ Reject ] [ Approve ]│
└────────────────────────────────────────────────────────────┘
```

Requirements: changelog excerpt **with its source URL**; the code diff; the test result; a link
to the real PR; Approve and **Reject** (the reject path gets demoed too).

## Panel 2 — "Did" panel (nice to have)

What the watch has actually done: entries seen, PRs opened, what is awaiting approval, what was
rejected and why. Reverse-chronological. This is what makes it feel like a *watch* rather than
a one-shot script.

## Constraints

- Reads state from the TrueForge HTTP API (REST + SSE, `http://localhost:8790/api/v1/docs`).
- **Must survive a hard refresh mid-approval** — that is D5, and it is 10 seconds of demo for
  a whole scored capability.
- Legible on a projector at 1080p. Big type. No hover-only affordances.

## VERIFY

- [ ] Is `@truefoundry/trueforge-ui` embeddable standalone, or must panels live inside the
      harness UI? **If standalone embedding does not work, cut #4 fires immediately** — do not
      spend the afternoon fighting it.
- [ ] Which API endpoint exposes a pending approval and its payload.
- [ ] Whether SSE gives live updates or the panel must poll.
