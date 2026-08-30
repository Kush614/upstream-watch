/**
 * A fixture-backed npm registry (CLAUDE.md §7).
 *
 * Every external client ships a fake so tests never touch the network. The fixture is a
 * trimmed capture of express's real registry document — including its `5.0.0-beta.1`, which
 * is what makes the prerelease-filtering test meaningful.
 */

import { readFile } from "node:fs/promises";
import { RegistryError } from "../errors.ts";
import { fromRepoRoot } from "../lib/paths.ts";
import type { PackageVersions } from "./registry.ts";
import { majorOf } from "./registry.ts";

const FIXTURES: Record<string, string> = {
  express: "pipeline/test/fixtures/registry-express.json",
};

export async function versionsOf(name: string): Promise<PackageVersions> {
  const file = FIXTURES[name];
  // An unknown package must fail the way the real client does, not return an empty answer
  // that a caller would read as "no versions published".
  if (!file) throw new RegistryError(`no fixture for ${name}`, { name });

  const body = JSON.parse(await readFile(fromRepoRoot(file), "utf8")) as {
    "dist-tags": { latest: string };
    time: Record<string, string>;
  };

  const releases = Object.entries(body.time)
    .filter(([v]) => majorOf(v) !== null)
    .map(([version, published]) => ({ version, published }))
    .sort((a, b) => a.published.localeCompare(b.published));

  return { name, latest: body["dist-tags"].latest, releases };
}
