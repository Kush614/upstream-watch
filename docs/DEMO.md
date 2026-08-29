# Demo script — 3 minutes, verbatim

Setup before judges arrive: TrueForge running, UI open on the Upstream Watch session, terminal
visible. Run **live** if Bright Data credentials are loaded; otherwise `DEMO_MODE=1` replays
the committed capture of the real page. Say which one out loud — the run prints its provenance
and the PR body states it.

Reset first: `pnpm demo:rewind --since 2026-08-20`. That forgets the latest Stripe release so
it shows up as new. Every entry the demo surfaces is genuinely Stripe's, carrying Stripe's own
`breaking` flag; only our memory of having seen it is rewound.

**0:00 — The line.** "This watches the APIs your code depends on, fixes your code when they change, and asks before it merges. Not package versions — the docs behind them, which is where the silent breakage lives."

**0:15 — Show the victim.** Flash `demo-app/src/payments.ts` — 97 lines, calls
`stripe.charges.create`. "Tiny payments service. Tests pass." Run `pnpm --filter demo-app test`
— 14 green.

**0:30 — Start the watch.** In UI: "Check upstream." Doing-panel streams: skill loaded → scrape → cache → diff. "Bright Data pulled the changelog; the pipeline diffed it against last run."

**0:50 — Change found.** Event card: `breaking: true`, straight from Stripe's own flag.
"Stripe removed support for specifying payment method types on Payment Intents — and it knows
that's breaking, we didn't have to guess."

Point at the second line: **three other breaking changes in the same release, listed and not
acted on.** "Those touch payouts and trial offers. We don't call those, so it says so and
stops. An agent that opens a PR for every deprecation gets muted in a week."

**1:00 — Sandbox spins up.** Doing-panel shows patcher subagent + Daytona provision. "Note: no sandbox until now. Watch turns are cheap; only a real change costs compute." Tests run in sandbox — green.

**1:30 — PR opened.** Did-panel shows PR link. Open it in GitHub: body contains changelog excerpt + diff + test output. Qodo comment visible.

**1:45 — The pause.** Approval card: changelog excerpt on left, code diff on right, "Merge?" "It will not merge on its own. This is the irreversible step."

**1:55 — WOW 1: reconnect.** Close the tab. Reopen. Card still there, run still paused. "Sessions live in the harness, not the browser."

**2:10 — Approve.** Click. PR merges. Did-panel updates.

**2:20 — WOW 2: the web changed.** Terminal: `pnpm demo:break-page`. "Stripe redesigned their
changelog." Trigger check → `SCHEMA MISMATCH · Extraction produced 0 entries`, not a crash.
Then `pnpm repair --vendor stripe`, the model proposes a new spec, and
`pnpm validate-spec` gates it against the **cached** HTML — no network — reporting which
previously-recorded entries the candidate can still find. PR opened on SKILL.md. "It noticed,
repaired its own extraction spec, checked the repair against the bytes that broke it, and put
that through review too."

**2:50 — Close.** "Harness does the orchestration, sandbox, approvals, sessions. Bright Data feeds it and stays fed. Every line went through Qodo. Repo and blog are linked."

## The breaking change

**Not seeded — real.** Stripe's `2026-08-26` release, entry *"Removes support for specifying
payment method types in Payment Intents and Setup Intents"*, `breaking: true`, with
`affected: ["PaymentIntent#create", "PaymentIntent#confirm", …]`. It maps to
`demo-app/src/payments.ts` because `agent/targets.yaml` lists `payment_intents` and
`PaymentIntent#create` among the symbols we call.

A judge can open the permalink the run prints and read it on Stripe's own site. There is no
invented entry anywhere in the demo.

## Backup
Record a full run at 17:30 with screen recorder. If anything fails live, narrate over the video.
