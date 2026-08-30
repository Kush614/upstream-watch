/**
 * Loading agent/packages.yaml — the open-source dependencies this repo watches.
 *
 * Kept beside targets.ts because it answers the same question for a different kind of
 * upstream. A vendor is watched through whatever it publishes; a package is watched
 * through its registry, its releases AND its source, because all three are readable and
 * they do not always agree.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";

const PACKAGES_FILE = "agent/packages.yaml";

export interface WatchedPackage {
  name: string;
  repo: string;
  package: string;
  /** The major this repo's code was written against. */
  pinned: string;
  symbols: string[];
  files: string[];
  /**
   * `silent` means the old call still works and now means something else.
   *
   * Worth a field of its own because it inverts the usual triage: a loud break is found by
   * the first person to run the code, and a silent one is found by a customer.
   */
  severity: "silent" | "loud";
}

function strings(value: unknown, field: string, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    // An empty symbol list loads fine and then makes every release look irrelevant.
    throw new ConfigError(`packages.yaml: "${name}.${field}" must be a non-empty list`, { name });
  }
  return value.map(String);
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

  return entries.map(([name, v]) => {
    for (const key of ["repo", "package", "pinned"] as const) {
      if (typeof v[key] !== "string" || !v[key]) {
        throw new ConfigError(`packages.yaml: "${name}.${key}" must be a non-empty string`, { name, key });
      }
    }

    const severity = v.severity === "silent" || v.severity === "loud" ? v.severity : "loud";

    return {
      name,
      repo: String(v.repo),
      package: String(v.package),
      pinned: String(v.pinned),
      symbols: strings(v.symbols, "symbols", name),
      files: strings(v.files, "files", name),
      severity,
    };
  });
}
