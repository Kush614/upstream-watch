import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { Targets, VendorTarget } from "../types.ts";

/** Format fixed by specs/agent.md §`agent/targets.yaml` format. */
const TARGETS_FILE = "agent/targets.yaml";

function strings(value: unknown, field: string, vendor: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    // An empty list here loads fine and then silently makes every change look
    // irrelevant, or leaves the patcher with nothing to edit.
    throw new ConfigError(`targets.yaml: "${vendor}.${field}" must be a non-empty list`, { vendor });
  }
  return value.map(String);
}

export async function loadTargets(file = TARGETS_FILE): Promise<Targets> {
  let raw: { repo?: unknown; vendors?: Record<string, Record<string, unknown>> };
  try {
    raw = parseYaml(await readFile(fromRepoRoot(file), "utf8")) as typeof raw;
  } catch (cause) {
    throw new ConfigError(`Could not read ${file}`, { cause: String(cause) });
  }

  if (typeof raw?.repo !== "string" || !raw.repo.includes("/")) {
    throw new ConfigError(`targets.yaml: "repo" must be "owner/name"`, { repo: raw?.repo });
  }
  if (!raw.vendors || typeof raw.vendors !== "object" || Object.keys(raw.vendors).length === 0) {
    throw new ConfigError(`targets.yaml: "vendors" must be a non-empty map`);
  }

  const vendors: VendorTarget[] = Object.entries(raw.vendors).map(([vendor, v]) => {
    if (typeof v?.url !== "string") {
      throw new ConfigError(`targets.yaml: "${vendor}.url" is required`, { vendor });
    }
    return {
      vendor,
      url: v.url,
      schema: typeof v.schema === "string" ? v.schema : "schemas/changelog-entry.json",
      symbols: strings(v.symbols, "symbols", vendor),
      files: strings(v.files, "files", vendor),
    };
  });

  return { repo: raw.repo, vendors };
}

export async function loadTarget(vendor: string, file = TARGETS_FILE): Promise<VendorTarget> {
  const found = (await loadTargets(file)).vendors.find((v) => v.vendor === vendor);
  if (!found) throw new ConfigError(`No vendor "${vendor}" in ${file}`, { vendor });
  return found;
}
