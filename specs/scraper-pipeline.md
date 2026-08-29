# SPEC — scraper pipeline

> Status: **skeleton**. Settings live in `CLAUDE.md` §6 — mirror any change here in the same
> commit.

## 1. Stages

```
scrape ──▶ cache ──▶ parse ──▶ validate ──▶ diff ──▶ relevance ──▶ change event
```

Each stage is one file under `pipeline/src/`. One concern per file (`CLAUDE.md` §7).

## 2. Scrape

- Bright Data Scraper Studio, driven from the CLI. Command: **TODO** (`CLAUDE.md` §6).
- `DEMO_MODE=1` → read from `agent/fixtures/html/` instead. Same interface, different client.
- Retry 3× (`CLAUDE.md` §6).
- **Raw HTML is written to `cache_dir` before anything parses it. Never parse without caching.**
  The cache is what makes self-repair possible and the demo reproducible.

## 3. Parse + validate

Output conforms to `schemas/changelog-entry.json`:
`{ vendor, date, title, body, url, breaking }`.

`breaking` classification — **decided: keyword heuristic**, in `pipeline/src/lib/classify.ts`.
Six signals (`breaking-change`, `deprecated`, `will-be-removed`, `no-longer`, `must-migrate`,
`renamed`), any one of which flags the entry. Chosen over a model call because it is
deterministic, free, testable offline, and auditable on camera — a judge can read the regexes.

The cost is precision, and we accept it: a false positive costs a PR nobody merges, and the
approval gate catches it. Revisit only if the fixture shows a miss. `classify()` returns the
signals that fired, and they are printed in the PR body so a human can check the reasoning.

## 4. Self-repair

**A scrape that returns 0 entries or fails schema validation is a change event, not an error**
(`CLAUDE.md` §6). Vendors redesign their changelog pages; that is signal.

**Partial failures count too.** If some entries validate and some do not, the run continues on
the ones it can read *and* emits an `extraction-broken` event with `partial: true`. Carrying on
quietly would drop the invalid entries — and a newly added breaking entry is exactly the kind
that is malformed first, so it could stay invisible indefinitely.

1. Detect: 0 entries, a schema failure, or any invalid entry alongside valid ones.
2. Re-run the extraction against the **cached** HTML — cheap, offline, repeatable.
3. Propose a new extraction spec.
4. Validate the proposal against the cached HTML.
5. Only then re-run live.
6. **Open a PR for the spec change. Never silently mutate config** (`CLAUDE.md` §6).

Guard against loops: at most **one** repair attempt per target per run —
`MAX_REPAIRS_PER_RUN` in `pipeline/src/run.ts`.

`proposeExtractionSpec()` (`pipeline/src/lib/repair.ts`) works by reading the cached HTML:
it ranks repeated `tag.class` containers, derives field selectors from what the first one
actually contains (a date-shaped attribute or child, the first heading, the largest non-heading
text block, the first anchor), then **scores each candidate by how many schema-valid entries it
actually yields** and keeps the best. It returns `null` rather than guessing when nothing
validates. It never writes: the proposal goes into a PR.

## 5. Diff + relevance

- Diff new entries against last seen. **Decided:** a gitignored JSON file at
  `.upstream-watch/state.json` (`pipeline/src/lib/state.ts`), not the harness's SQLite — the
  pipeline runs as a plain script, and local state means `pnpm demo:seed` resets the demo by
  deleting one file. Entry identity is the vendor's own permalink.
- **First run baselines silently.** Everything looks new the first time; reporting a vendor's
  whole backlog as breaking news would be noise, so `firstRun` suppresses events.
- Relevance: match the entry against `agent/targets.yaml` → the watched code paths. An entry
  that is breaking but touches nothing we call is recorded and **not** acted on. The baseline
  fixture contains one such entry (`legacy_reporting`) specifically to keep this path tested.
- Matching prefers **code spans over prose**: `parse.ts` rewrites `<code>` into backticked
  tokens, and `relevance.ts` reports `how: "code"` for a match inside one and `how: "text"` for
  a bare prose match. This is what stops the symbol `source` matching the English word, or
  matching inside `resource_id`.

## 6. Clients + tests

- Every external call goes through `pipeline/src/clients/` with typed responses and a
  fixture-backed fake (`CLAUDE.md` §7).
- Vitest over fixtures. **No network in tests.**
- Minimum coverage: seeded-breaking fixture → exactly one relevant event; clean fixture → zero;
  structurally broken fixture → a repair event, not a crash.
