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

`breaking` classification — **TODO**, decide and document: keyword heuristics
(deprecat*/remov*/breaking/no longer), the vendor's own labels, or a model call. Prefer the
cheapest thing that works on the fixture; note the choice here.

## 4. Self-repair

**A scrape that returns 0 entries or fails schema validation is a change event, not an error**
(`CLAUDE.md` §6). Vendors redesign their changelog pages; that is signal.

1. Detect: 0 entries, or a schema failure.
2. Re-run the extraction against the **cached** HTML — cheap, offline, repeatable.
3. Propose a new extraction spec.
4. Validate the proposal against the cached HTML.
5. Only then re-run live.
6. **Open a PR for the spec change. Never silently mutate config** (`CLAUDE.md` §6).

Guard against loops: at most **one** repair attempt per target per run. **TODO:** confirm and
implement the cap.

## 5. Diff + relevance

- Diff new entries against last seen. **TODO:** where last-seen state lives (SQLite via the
  harness? a JSON file in `pipeline/`?). Decide before H2.
- Relevance: match the entry against `agent/targets.yaml` → the watched code paths. An entry
  that is breaking but touches nothing we call is recorded and **not** acted on.

## 6. Clients + tests

- Every external call goes through `pipeline/src/clients/` with typed responses and a
  fixture-backed fake (`CLAUDE.md` §7).
- Vitest over fixtures. **No network in tests.**
- Minimum coverage: seeded-breaking fixture → exactly one relevant event; clean fixture → zero;
  structurally broken fixture → a repair event, not a crash.
