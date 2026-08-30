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
}

function strings(value: unknown, field: string, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(`packages.yaml: "${name}.${field}" must be a non-empty list`, { name });
  }
  return value.map(String);
}

/** The version actually installed, from the manifest that declares it. */
async function installedVersion(manifest: string, pkg: string, name: string): Promise<string> {
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

  const exact = /(\d+\.\d+\.\d+)/.exec(range)?.[1];
  if (!exact) {
    throw new ConfigError(`packages.yaml: cannot read a version out of "${pkg}": "${range}" in ${manifest}`, {
      name,
      range,
    });
  }
  return exact;
}

/**
 * Which declared symbols actually appear in the declared files.
 *
 * A symbol nobody calls cannot break you, and reporting it as though it could is the same
 * fabrication as an invented version. Returned rather than thrown, so the caller can say
 * "declared but not used" instead of quietly narrowing the watch.
 */
async function unusedSymbols(files: string[], symbols: string[]): Promise<string[]> {
  const sources = await Promise.all(
    files.map(async (f) => {
      try {
        return await readFile(fromRepoRoot(f), "utf8");
      } catch {
        return "";
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

      const pinned =
        role === "dependency"
          ? await installedVersion(String(v.manifest ?? ""), pkg, name)
          : String(v.pinned ?? "");

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
        note: v.note ? String(v.note) : undefined,
        // Only a dependency can have unused symbols; a reference has no files by design.
        unusedSymbols: role === "dependency" ? await unusedSymbols(files, symbols) : [],
      } satisfies WatchedPackage;
    }),
  );
}
