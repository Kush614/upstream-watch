# PITCH — 90 seconds

> Status: **skeleton**. Finalise after the demo works, not before.

## The one-liner

Upstream Watch watches the third-party APIs your code depends on, patches your code when they
change, and asks before it merges.

## The 90 seconds

**Problem (20s).** Your code calls Stripe, Twilio, Slack, OpenAI. Those vendors deprecate
parameters and change response shapes on their own schedule. Nobody reads every changelog. You
find out in production. _TBD: land this with one concrete number or war story._

**Insight (15s).** An LLM will happily tell you to go read the changelog. That is the gap this
hackathon is about — advice is cheap, doing the work is not.

**What it does (30s).** Scrapes the changelog. Decides whether the change touches *your* code.
Opens a sandbox, patches it, runs your tests. Opens a PR with the changelog quoted in the
description. Then it **stops and asks you**, and remembers where it was when you come back.

**Why the harness (15s).** Every one of those verbs is a harness capability doing real work:
MCP tools for GitHub, Daytona for isolation, a subagent for the patch, an approval checkpoint
for the merge, a persistent session for the waiting. _TBD: name the one that surprised you._

**The close (10s).** The agent does the work. The human keeps the merge button. _TBD._

## Questions to have answers ready for

- Why not Dependabot? _TBD — Dependabot watches package versions; this watches vendor
  behaviour, which ships without a version bump._
- What if the patch is wrong? _TBD — tests gate the PR, the human gates the merge; a wrong
  patch costs a review, not an outage._
- Does it scale past one vendor? _TBD — `agent/targets.yaml` is a list; be honest about what
  was actually demoed._
