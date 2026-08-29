# NOTES — what broke, and what we did about it

Running log. Append, never rewrite. Newest at the bottom. This file is the source for the
blog post (Field Report track), so write entries as if a stranger will read them.

**Entry format:**

```
## YYYY-MM-DD HH:MM — one-line summary
**Where:** component / file
**Symptom:** what you actually saw (paste the error)
**Cause:** what was really wrong
**Fix:** what changed
**Lesson:** the sentence worth keeping
```

---

## 2026-08-29 — Repo scaffolded

**Where:** whole repo
**Symptom:** n/a — starting point.
**Cause:** n/a
**Fix:** Created the skeleton from `CLAUDE.md` §3, wrote `docs/PLAN.md`, stubbed `specs/`.
**Lesson:** The plan is written before the build day starts, so the cut order is decided while
nobody is panicking. Open questions are recorded as `VERIFY:` markers rather than guesses —
every one of them is a thing that can eat an hour tomorrow if it is wrong.
