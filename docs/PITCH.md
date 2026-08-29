# Pitch — 90 seconds

**Problem (15s).** Dependabot tells you when a package version changes. Nobody tells you when the API *behind* it changes — a deprecation note in a changelog nobody reads. That's how a working integration breaks at 2 AM with no diff in your lockfile.

**What it does (15s).** Upstream Watch watches those pages, detects breaking changes that touch your code, patches and tests the fix in a sandbox, opens the PR, and stops for your approval before merge.

**How it's built (30s).** TrueForge runs the loop: a watcher subagent per vendor, a patcher subagent that provisions a Daytona sandbox only when there's actually something to fix, an approval checkpoint on merge, and a session that survives me closing the laptop. Bright Data feeds it live changelogs; when a vendor redesigns their docs, the pipeline detects the schema break, repairs its own extraction spec, and puts that repair through review too. Every PR — the agent's and mine — went through Qodo.

**What broke (15s).** I built the scraper against a fixture I wrote myself. Clean markup,
sensible class names. Then I fetched the real Stripe changelog: 3 MB, exactly one `<article>`
tag, class names like `sn-1iugkao` — the entries aren't in the DOM at all, they're in a JSON
blob the page hydrates from. Every heuristic I'd tuned scored zero. But the blob turned out to
carry Stripe's own `breaking` flag and the exact API symbols each change touches, so the
detection ended up more precise than the version I'd designed. A fixture you invent tests your
assumptions, not the world.

**Ask (15s).** Repo, blog, and demo video are linked. I'd love feedback on whether the approval UX is something you'd trust on a real repo.

Rules: no "genuinely", no reading, make eye contact on the WOW moments, stop at 90s even mid-sentence.
