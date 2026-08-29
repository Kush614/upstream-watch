# SPEC — Qodo workflow

> Status: **skeleton**. This is the entire **Q Branch** track (Best Code Quality, Mac Mini) and
> it **cannot be reconstructed after the fact** — the PR history is the proof.

## Non-negotiable

`CLAUDE.md` §2.1 — **no direct pushes to `main`.** Direct pushes do not count as reviewed work.

## Per-change loop

1. Branch off `main` (`CLAUDE.md` §8: `feat/pipeline`, `feat/agent`, `feat/ui`, `feat/demo`).
2. Implement. Add or update a fixture-backed Vitest test if `pipeline/` is touched
   (`CLAUDE.md` §7).
3. Commit as `feat|fix|chore|docs(scope): summary`.
4. Open a PR. **Keep it under ~300 lines** — Qodo and humans both review small PRs better.
5. Qodo reviews automatically. If it does not respond within a few minutes, comment
   `/agentic_review`.
6. **Fix every valid High.** Use judgement on Medium/Low. If a finding is wrong, deferred, or
   expected, **dismiss it in the Qodo thread with a written reason** — a dismissal with a
   reason is evidence of engagement; a silent dismissal is not.
7. Push fixes to the same PR, re-run `/agentic_review` if needed.
8. Merge. Append anything that broke to `NOTES.md` (`CLAUDE.md` §10).

## Evidence section (README)

Required, and worth writing *as PRs merge* rather than at 17:30:

- A link to at least one **representative merged PR** with meaningful hackathon code.
- 1–2 lines on what Qodo found and what was changed or intentionally dismissed.
- The PR history showing the review and the follow-up review.

The **public PR link is the required proof**. Screenshots add context but cannot replace it.
Judges may check other merges to confirm Qodo was part of the process rather than a one-time
step at the end — so run it on every meaningful PR, starting with the first one.

## If Qodo goes quiet

1. Confirm the GitHub App has access to this repository.
2. Confirm the repository is active in Qodo.
3. Comment `/agentic_review` on the PR.
4. Still nothing → `NOTES.md`, and raise it early. Do not discover this at 16:00.

## Optional

`npx skills add qodo-ai/qodo-skills/skills` provides a `qodo-pr-resolver` skill for working
through findings with a coding agent.
