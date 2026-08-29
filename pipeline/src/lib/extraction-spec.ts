import { readFile, writeFile } from "node:fs/promises";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { ExtractionSpec } from "../types.ts";

const REQUIRED_FIELDS = ["date", "title", "body", "url"] as const;

export async function loadExtractionSpec(file: string): Promise<ExtractionSpec> {
  let spec: ExtractionSpec;
  try {
    spec = JSON.parse(await readFile(fromRepoRoot(file), "utf8")) as ExtractionSpec;
  } catch (cause) {
    throw new ConfigError(`Could not read extraction spec ${file}`, { cause: String(cause) });
  }

  if (typeof spec.entry !== "string" || spec.entry.length === 0) {
    throw new ConfigError(`Extraction spec ${file} has no entry selector`, { spec });
  }

  // parse.ts reads all four fields unconditionally, so a spec missing any one of them
  // would throw a TypeError deep in extraction rather than a ConfigError here.
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = spec.fields?.[field];
    return typeof value !== "object" || value === null;
  });

  if (missing.length > 0) {
    throw new ConfigError(
      `Extraction spec ${file} is missing field spec(s): ${missing.join(", ")}`,
      { spec },
    );
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
