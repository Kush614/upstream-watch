# fixtures

Cached HTML and the seeded breaking change that make the demo reproducible.

- `html/` — raw vendor pages. **Every scrape writes here before parsing** (`CLAUDE.md` §6).
  This is also the cache self-repair re-runs against (`specs/scraper-pipeline.md` §4).
- `DEMO_MODE=1` serves these instead of hitting Bright Data (`CLAUDE.md` §5).

Populate in preflight / H1 (`docs/PLAN.md` §3, §4):

| File | What it is |
| --- | --- |
| `html/stripe-changelog.html` | The real page, saved tonight. The "nothing changed" baseline. |
| `html/stripe-changelog-breaking.html` | The same page **plus one seeded entry** deprecating the exact parameter `demo-app/` uses. Must differ from the baseline by exactly one entry. |
| `html/stripe-changelog-restructured.html` | The baseline with the entry container renamed — drives the D7 self-repair beat. |

Commit these. They are the reason a cold demo run is repeatable at 17:15.
