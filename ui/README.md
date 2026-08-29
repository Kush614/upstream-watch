# ui

Embeds `@truefoundry/trueforge-ui` and adds two panels — see `specs/ui.md`.

**Not wired yet.** `@truefoundry/trueforge-ui` is deliberately *not* in `package.json`: whether
it is embeddable standalone is an open question (`docs/PLAN.md` §8, item 4). Verify the package
name and embedding story in preflight, then add it. Declaring a package name that does not
resolve would break `pnpm install` on build-day morning.

If standalone embedding does not work → cut #4 (`docs/PLAN.md` §6): use the stock TrueForge
approval UI and spend the hour elsewhere.
