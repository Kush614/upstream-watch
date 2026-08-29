---
name: brightdata-changelog-scraper
description: Scrape a vendor API changelog via Bright Data, cache raw HTML, parse to ChangelogEntry[], diff against last run, and self-repair the extraction spec when the page structure changes. Use whenever asked to check upstream, watch a vendor, or refresh changelog data.
---

# Bright Data changelog scraper

## When to use
Any request to check, watch, or refresh a vendor's API changelog. Also invoked automatically
by the Upstream Watch orchestrator for each vendor in `agent/targets.yaml`.

## Steps
1. Read the vendor block below for `url` and extraction spec.
2. Run: `pnpm --filter pipeline scrape --vendor <vendor>`
   (wraps the Bright Data Web Unlocker API: `POST https://api.brightdata.com/request`
   with `{zone, url, format: "raw"}` and `Authorization: Bearer $BRIGHTDATA_API_KEY`)
3. Confirm raw HTML was cached under `agent/fixtures/html/<vendor>/`.
4. Read stdout JSON. If `type == "SchemaMismatch"` → run repair (§Repair).
   Else return `ChangeEvent[]` verbatim.

## Repair
1. `pnpm --filter pipeline repair --vendor <vendor>` prepares `repair-context.json`
   (current HTML, last-good HTML, current spec, schema, examples).
2. Propose a new spec using `agent/prompts/repair.md`. Output YAML only.
3. `pnpm --filter pipeline validate-spec --vendor <vendor> --spec <file>` — must pass
   against cached HTML.
4. If pass: update the vendor block in this file on branch `repair/<vendor>-<ts>`, open PR,
   re-run step 2 of Steps.
5. If fail twice: return `{type:"repair_failed", vendor}`.

## Rules
- Never parse without caching first.
- 0 entries is a change event, not success.
- Never edit a spec in place on `main`; always via PR.
- Do not paste raw HTML into chat context; refer to file paths.
- Report provenance honestly: `live` means Bright Data fetched it, `cache` means it did not.

## Extraction specs (version-controlled; mirror in CLAUDE.md §6)

```yaml
vendors:
  stripe:
    url: https://docs.stripe.com/changelog
    # Stripe server-renders the changelog as JSON in a <script>, not as markup. CSS
    # selectors cannot reach it, and its class names are build-hashed (`sn-1iugkao`)
    # so they would be worthless anyway. See NOTES.md 2026-08-30.
    strategy: embedded-json
    json:
      marker: "window.__INITIAL_STATE__ = "
      entries_path: "article.content.children[].attributes.releaseTrains[].releases[].changelogEntries[]"
      map:
        date: "release"                      # "2026-08-26.dahlia" -> leading ISO date
        title: "title[0]"
        body: ["description", "impact", "changed", "affected"]
        url: "https://docs.stripe.com/changelog/{train}#{slug}"
        breaking: "breaking"                 # Stripe publishes this itself
    breaking_hint: ["deprecat", "removed", "breaking", "no longer"]
```

### Why `strategy` exists
`specs/scraper-pipeline.md` §1 assumes `entry_selector` + CSS field selectors, which is right
for most changelogs. Stripe is not one of them: the page carries 880 entries inside
`window.__INITIAL_STATE__`, each already tagged with the vendor's own `breaking` boolean and
the exact API symbols it changes. Extracting the JSON is both possible and strictly better
than scraping rendered markup — Stripe tells us what is breaking, so we do not have to guess.

`strategy: css` remains the default for any vendor that renders entries as HTML.
