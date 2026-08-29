import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { WatchTarget } from "../types.ts";

const TARGETS_FILE = "agent/targets.yaml";

interface RawTarget {
  vendor?: unknown;
  name?: unknown;
  url?: unknown;
  fixtures?: { baseline?: unknown; breaking?: unknown; restructured?: unknown };
  extraction_spec?: unknown;
  watches?: Array<{ path?: unknown; symbols?: unknown }>;
}

function str(value: unknown, field: string, vendor: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConfigError(`targets.yaml: "${field}" must be a non-empty string`, { vendor, value });
  }
  return value;
}

/** Load and validate agent/targets.yaml (CLAUDE.md §6 - targets_file). */
export async function loadTargets(file = TARGETS_FILE): Promise<WatchTarget[]> {
  let raw: { version?: unknown; targets?: unknown };
  try {
    raw = parseYaml(await readFile(fromRepoRoot(file), "utf8")) as typeof raw;
  } catch (cause) {
    throw new ConfigError(`Could not read ${file}`, { cause: String(cause) });
  }

  if (raw?.version !== 1) {
    throw new ConfigError(`targets.yaml: unsupported version`, { version: raw?.version });
  }
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) {
    throw new ConfigError(`targets.yaml: "targets" must be a non-empty list`);
  }

  return (raw.targets as RawTarget[]).map((t) => {
    const vendor = str(t.vendor, "vendor", "<unknown>");
    const watches = Array.isArray(t.watches) ? t.watches : [];
    if (watches.length === 0) {
      throw new ConfigError(`targets.yaml: "${vendor}" has no watches`, { vendor });
    }

    return {
      vendor,
      name: str(t.name, "name", vendor),
      url: str(t.url, "url", vendor),
      fixtures: {
        baseline: str(t.fixtures?.baseline, "fixtures.baseline", vendor),
        breaking: str(t.fixtures?.breaking, "fixtures.breaking", vendor),
        restructured: str(t.fixtures?.restructured, "fixtures.restructured", vendor),
      },
      extractionSpec: str(t.extraction_spec, "extraction_spec", vendor),
      watches: watches.map((w) => ({
        path: str(w.path, "watches[].path", vendor),
        symbols: Array.isArray(w.symbols) ? w.symbols.map(String) : [],
      })),
    } satisfies WatchTarget;
  });
}
