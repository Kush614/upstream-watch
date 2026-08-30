/**
 * The npm registry.
 *
 * Every external call goes through a client with typed responses (CLAUDE.md §7). This one
 * answers the question a changelog cannot: *which versions actually exist, and how long
 * have you been behind?* No auth — the registry is public.
 */

import { RegistryError } from "../errors.ts";

export interface Release {
  version: string;
  published: string;
}

export interface PackageVersions {
  name: string;
  latest: string;
  /** Every published, non-prerelease version, oldest first. */
  releases: Release[];
}

const REGISTRY = process.env.NPM_REGISTRY ?? "https://registry.npmjs.org";

/** Semver-ish major, or null for anything that is not a plain x.y.z. */
export function majorOf(version: string): number | null {
  const m = /^(\d+)\.\d+\.\d+$/.exec(version);
  return m ? Number(m[1]) : null;
}

export async function versionsOf(name: string, signal?: AbortSignal): Promise<PackageVersions> {
  // The full document, deliberately. The abbreviated `install-v1` format is much smaller
  // but carries no `time` map, and publish dates are the whole point here: "two majors
  // behind" is far less useful than "the break has been one npm update away since 2024".
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, { signal });

  if (!res.ok) {
    throw new RegistryError(`${name} -> ${res.status} ${res.statusText}`, { name, status: res.status });
  }

  const body = (await res.json()) as {
    "dist-tags"?: { latest?: string };
    time?: Record<string, string>;
  };

  const latest = body["dist-tags"]?.latest;
  if (!latest) throw new RegistryError(`${name} has no latest dist-tag`, { name });

  const time = body.time ?? {};
  const releases = Object.entries(time)
    .filter(([v]) => majorOf(v) !== null)
    .map(([version, published]) => ({ version, published }))
    .sort((a, b) => a.published.localeCompare(b.published));

  if (releases.length === 0) throw new RegistryError(`${name} published no plain versions`, { name });

  return { name, latest, releases };
}

/**
 * How far behind `pinned` is, in majors and in days.
 *
 * Returned as data rather than a sentence, because "two majors and 719 days" is the fact a
 * reader can check and "very out of date" is an opinion.
 */
export function staleness(
  versions: PackageVersions,
  pinned: string,
  now = new Date(),
): { majorsBehind: number; daysSincePinned: number | null; nextMajor: Release | null } {
  const pinnedMajor = majorOf(pinned);
  const latestMajor = majorOf(versions.latest);

  const pinnedRelease = versions.releases.find((r) => r.version === pinned) ?? null;
  const daysSincePinned = pinnedRelease
    ? Math.max(0, Math.round((now.getTime() - new Date(pinnedRelease.published).getTime()) / 86_400_000))
    : null;

  // The first release of the first major above the pin: the moment the break became
  // available to anyone who ran `npm update`.
  const nextMajor =
    pinnedMajor === null
      ? null
      : versions.releases.find((r) => (majorOf(r.version) ?? 0) === pinnedMajor + 1) ?? null;

  return {
    majorsBehind: pinnedMajor === null || latestMajor === null ? 0 : Math.max(0, latestMajor - pinnedMajor),
    daysSincePinned,
    nextMajor,
  };
}
