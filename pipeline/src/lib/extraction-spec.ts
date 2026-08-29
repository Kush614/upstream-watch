import { readFile, writeFile } from "node:fs/promises";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { ExtractionSpec } from "../types.ts";

export async function loadExtractionSpec(file: string): Promise<ExtractionSpec> {
  let spec: ExtractionSpec;
  try {
    spec = JSON.parse(await readFile(fromRepoRoot(file), "utf8")) as ExtractionSpec;
  } catch (cause) {
    throw new ConfigError(`Could not read extraction spec ${file}`, { cause: String(cause) });
  }

  if (!spec.entry || !spec.fields?.date || !spec.fields?.title) {
    throw new ConfigError(`Extraction spec ${file} is missing required fields`, { spec });
  }
  return spec;
}

/**
 * Write a repaired spec to disk.
 *
 * Callers must have gone through the approval path first: self-repair opens a PR for a
 * spec change, it does not silently mutate config (CLAUDE.md §6).
 */
export async function writeExtractionSpec(file: string, spec: ExtractionSpec): Promise<void> {
  await writeFile(fromRepoRoot(file), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
}
