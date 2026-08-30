/**
 * Loading agent/packages.yaml — the open-source upstreams this repo watches.
 *
 * Two roles, and the distinction is load-bearing. A `dependency` is something this repo
 * really installs: its version is read from the workspace manifest rather than written
 * here, and its symbols are checked against the files that claim to use them. A `reference`
 * is a known historical break kept for demonstration — reproducible by anyone, but never
 * presented as a finding about this codebase.
 *
 * That separation exists because the first version of this file asserted all three: that
 * the repo pinned express 4.19.2 (it is on ^5.2.1), called ReactDOM.render (it calls
 * createRoot), and depended on eslint (it does not). Each produced a finding about code
 * that does not exist.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";

const PACKAGES_FILE = "agent/packages.yaml";

export interface WatchedPackage {
  name: string;
  role: "dependency" | "reference";
  repo: string;
  package: string;
  /** Resolved at check time for a dependency; declared for a reference. */
  pinned: string;
  /** A reference states the version it is compared against; a dependency uses latest. */
  against?: string;
  symbols: string[];
  files: string[];
  severity: "silent" | "loud";
  /** Why a reference is here, and that it does not apply to this repo. */
  note?: string;
  /** Symbols declared but not found in `files`. Never silently dropped. */
  unusedSymbols?: string[];
  /** True when `pinned` came from node_modules; false when it is a range's floor. */
  versionIsInstalled?: boolean;
}

function strings(value: unknown, field: string, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(`packages.yaml: "${name}.${field}" must be a non-empty list`, { name });
  }
  return value.map(String);
}

/**
 * The version actually installed.
 *
 * Read from `node_modules/<pkg>/package.json`, which is the only place that knows. The
 * manifest holds a RANGE: `^5.2.1` permits 5.9.x, so taking its floor and calling it
 * "installed" is a guess that happens to be right until someone runs an update — and then
 * reports a version nobody has against a break that may not apply.
 *
 * With no node_modules we fall back to the range's floor and say so, rather than presenting
 * a guess as a reading.
 */
async function installedVersion(
  manifest: string,
  pkg: string,
  name: string,
): Promise<{ version: string; fromLockfile: boolean }> {
  let doc: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    doc = JSON.parse(await readFile(fromRepoRoot(manifest), "utf8")) as typeof doc;
  } catch (cause) {
    throw new ConfigError(`packages.yaml: "${name}.manifest" (${manifest}) could not be read`, {
      name,
      manifest,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const range = doc.dependencies?.[pkg] ?? doc.devDependencies?.[pkg];
  if (!range) {
    // Watching something the repo does not install is how you get a finding about code
    // that does not exist. Refuse rather than guess a version.
    throw new ConfigError(
      `packages.yaml: "${name}" is declared a dependency but ${manifest} does not depend on ${pkg}`,
      { name, manifest, package: pkg },
    );
  }

  // The installed tree first. Look beside the manifest, then at the workspace root, which
  // is where a hoisting package manager puts it.
  const dir = manifest.replace(/package\.json$/, "");
  for (const candidate of [`${dir}node_modules/${pkg}/package.json`, `node_modules/${pkg}/package.json`]) {
    try {
      const installed = JSON.parse(await readFile(fromRepoRoot(candidate), "utf8")) as { version?: string };
      if (installed.version) return { version: installed.version, fromLockfile: true };
    } catch {
      // Not here; try the next place before falling back to the range.
    }
  }

  const floor = /(\d+\.\d+\.\d+)/.exec(range)?.[1];
  if (!floor) {
    throw new ConfigError(`packages.yaml: cannot read a version out of "${pkg}": "${range}" in ${manifest}`, {
      name,
      range,
    });
  }
  return { version: floor, fromLockfile: false };
}

/**
 * Which declared symbols actually appear in the declared files.
 *
 * A symbol nobody calls cannot break you, and reporting it as though it could is the same
 * fabrication as an invented version. Returned rather than thrown, so the caller can say
 * "declared but not used" instead of quietly narrowing the watch.
 */
async function unusedSymbols(files: string[], symbols: string[], name: string): Promise<string[]> {
  const sources = await Promise.all(
    files.map(async (f) => {
      try {
        return await readFile(fromRepoRoot(f), "utf8");
      } catch (cause) {
        // Treating an unreadable file as an empty one marks every symbol "unused" and
        // silently switches the whole watch off. A missing watched file is a config error,
        // not evidence that the code does not use the symbol.
        throw new ConfigError(
          `packages.yaml: "${name}" watches ${f}, which could not be read`,
          { name, file: f, cause: cause instanceof Error ? cause.message : String(cause) },
        );
      }
    }),
  );

  const all = sources.join("\n");
  return symbols.filter((s) => !all.includes(s));
}

export async function loadPackages(file = PACKAGES_FILE): Promise<WatchedPackage[]> {
  let raw: { packages?: Record<string, Record<string, unknown>> };
  try {
    raw = parseYaml(await readFile(fromRepoRoot(file), "utf8")) as typeof raw;
  } catch (cause) {
    throw new ConfigError(`could not read ${file}: ${cause instanceof Error ? cause.message : String(cause)}`, { file });
  }

  const entries = Object.entries(raw.packages ?? {});
  if (entries.length === 0) throw new ConfigError(`${file} declares no packages`, { file });

  return Promise.all(
    entries.map(async ([name, v]) => {
      const role = v.role === "reference" ? "reference" : "dependency";
      for (const key of ["repo", "package"] as const) {
        if (typeof v[key] !== "string" || !v[key]) {
          throw new ConfigError(`packages.yaml: "${name}.${key}" must be a non-empty string`, { name, key });
        }
      }

      const pkg = String(v.package);
      const files = role === "reference" ? (v.files as string[] | undefined)?.map(String) ?? [] : strings(v.files, "files", name);
      const symbols = strings(v.symbols, "symbols", name);

      const resolved =
        role === "dependency" ? await installedVersion(String(v.manifest ?? ""), pkg, name) : null;
      const pinned = resolved ? resolved.version : String(v.pinned ?? "");

      if (!pinned) throw new ConfigError(`packages.yaml: reference "${name}" must declare a pinned version`, { name });

      return {
        name,
        role,
        repo: String(v.repo),
        package: pkg,
        pinned,
        against: v.against ? String(v.against) : undefined,
        symbols,
        files,
        severity: v.severity === "silent" ? "silent" : "loud",
        // False when we read the manifest's range instead of the installed tree, so callers
        // can say "declared" rather than "installed".
        versionIsInstalled: resolved ? resolved.fromLockfile : undefined,
        note: v.note ? String(v.note) : undefined,
        // Only a dependency can have unused symbols; a reference has no files by design.
        unusedSymbols: role === "dependency" ? await unusedSymbols(files, symbols, name) : [],
      } satisfies WatchedPackage;
    }),
  );
}
