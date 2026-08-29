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

## 2026-08-29 — Node's type stripping is not the same as compiling TypeScript

**Where:** `pipeline/src/clients/*.ts`, `pipeline/src/errors.ts`
**Symptom:** Every test passed, then `pnpm demo:seed` died instantly:
`SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not
supported in strip-only mode`.
**Cause:** We run the pipeline with `node --experimental-strip-types`, which *erases* type
annotations rather than compiling them. Anything that needs real codegen — parameter
properties (`constructor(private readonly x)`), enums, namespaces — has no erased form, so it
fails at runtime. Vitest uses a full transform, so the whole test suite was green while the
actual entry point could not start.
**Fix:** Rewrote the three constructors to use `#private` fields, and set
`"erasableSyntaxOnly": true` in `tsconfig.base.json`. That turns this from a runtime crash into
a typecheck error — it caught a third instance in `errors.ts` the moment it was switched on.
**Lesson:** When the test runner and the production runtime use different transforms, a green
suite proves less than it looks like it proves. Make the stricter runtime's constraints visible
to the typechecker, or you will find out at the worst moment. Worth 10 minutes tonight rather
than 10 minutes at 16:00 tomorrow.
