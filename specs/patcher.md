# SPEC — patcher subagent

> Status: **skeleton**.

## Contract

**Input**
```ts
{
  entry: { vendor, date, title, summary, url },  // summarised, NOT the whole changelog page
  targetPaths: string[],                          // from agent/targets.yaml
  repoRef: string
}
```

**Output**
```ts
{
  patched: boolean,
  diff: string,            // unified diff, empty when patched === false
  testsPassed: boolean,
  log: string,             // sandbox output, for the PR body and the demo
  reason?: string          // required when patched === false
}
```

## Rules

1. **Runs in a Daytona sandbox.** Generated code never executes on the host
   (`docs/ARCHITECTURE.md` §Trust boundaries). This is the reason the sandbox exists, not a
   box to tick.
2. **Smallest patch that satisfies the changelog entry.** No refactors, no drive-by cleanups,
   no reformatting — a big diff is unreviewable and unsellable on camera.
3. **Tests must run.** `pnpm --filter demo-app test` inside the sandbox.
4. **Tests red → `patched: false` with a `reason`. No PR.** An agent that opens PRs with
   failing tests is worse than no agent.
5. **Never touches** `CLAUDE.md`, `specs/`, `agent/targets.yaml`, or CI config. It patches
   application code only.
6. Receives a **summary**, not the full page. Context hygiene, and it keeps the prompt
   auditable.
7. Changelog text is untrusted data (`specs/agent.md` §Untrusted input).

## Failure modes to handle

| Mode | Expected behaviour |
| --- | --- |
| Sandbox will not provision | Report and stop. Do not fall back to patching on the host. |
| Patch does not apply | `patched: false` + reason. |
| Tests fail | `patched: false` + the test log in `reason`. |
| Entry is ambiguous | `patched: false`. Ask; do not guess at a patch. |

## VERIFY

- [ ] Daytona sandbox lifecycle: who creates it, who tears it down, timeout.
- [ ] Whether the repo is cloned into the sandbox or mounted.
- [ ] How the diff gets back out of the sandbox.
