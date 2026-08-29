# extraction-specs

One file per vendor, describing how to pull entries out of their changelog page.

These are **data, not code**, for one reason: when a vendor redesigns their page, self-repair
proposes a new spec, validates it against the cached HTML, and **opens a PR for the change**
(`CLAUDE.md` §6). It never silently mutates config, so a spec change is reviewable like any
other diff.

See `specs/scraper-pipeline.md` §4.
