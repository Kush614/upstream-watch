<!-- Keep PRs under ~300 lines (CLAUDE.md §8). Title: feat|fix|chore|docs(scope): summary -->

## What

## Why

<!-- Which demo step does this serve? D1–D7 in docs/PLAN.md §2. If it serves none, say why
     it is being built today (CLAUDE.md §2.2 — demo path first). -->
Demo step:

## Checklist

- [ ] Branch, not a direct push to `main` (CLAUDE.md §2.1)
- [ ] Fixture-backed Vitest test added/updated if `pipeline/` changed; no network in tests
- [ ] Irreversible actions take `{ approved: true }`, default dry-run (CLAUDE.md §7)
- [ ] Scraper settings mirrored into `CLAUDE.md` §6 if changed
- [ ] Anything that broke is in `NOTES.md`
- [ ] Qodo review run; Highs fixed, dismissals explained in-thread
