# Spec: Qodo workflow (Code Quality track)

## Setup (tonight)
Qodo → Integrations → SaaS → GitHub → Add installation → authorize repo. Confirm repo active in Qodo. First PR: `chore: repo skeleton` → `/agentic_review` if it doesn't auto-run.

## Every PR
1. Branch from `main`. Keep diff < 300 lines.
2. Open PR with description (Qodo describe tool ok).
3. Wait for review. Fix all valid **High**. Judge **Medium/Low**; fix cheap ones.
4. Dismiss invalid/deferred findings *in the Qodo thread* with one-line reason. Silence looks like ignoring.
5. Push fixes → `/agentic_review` again if needed. Merge.

Agent-generated PRs (patches and scraper repairs) follow the same flow. This is a pitch point: the agent's code is held to the same bar.

Optional accelerator: `npx skills add qodo-ai/qodo-skills/skills` → use `qodo-pr-resolver` to fix findings.

## README section (required, exact heading)
```
## Qodo Code Review Evidence
- Representative PR: <public link to a merged PR with meaningful code>
- What Qodo found / what changed or was dismissed: <1–2 lines>
- Review history: <link to PR conversation showing review + follow-up>
```
Judges may check other merges. Aim for every merged PR to show a Qodo comment.

## Record so far

4 PRs, **16 findings, 0 dismissed as invalid** (one dismissed as a false positive, with three
independent proofs). Follow-up reviews: #1 2→1, #2 7→0, #3 5→0, #4 2→0 pending re-review.
Sharpest catches: a vendor-controlled changelog title interpolated into a Markdown heading in a
PR a human was about to approve, and a last-good regression check that compared a candidate
against its own output and so could never fail.

## "Someone could clone, understand, extend"
- README: what it is, architecture diagram (from docs/ARCHITECTURE.md), how to run, how to add a vendor (edit `targets.yaml` + SKILL.md block), demo mode.
- Prompts in files. Clients typed. Tests fixture-backed. `.env.example` complete.
