import { readFile } from "node:fs/promises";
// The schema declares draft 2020-12, so it needs the 2020 build of Ajv - the default
// export only knows draft-07 and rejects the $schema outright.
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { ChangelogEntry } from "../types.ts";

const compiled = new Map<string, ValidateFunction>();

/** Compile (and cache) the JSON Schema a vendor's targets.yaml block points at. */
export async function loadValidator(schemaPath: string): Promise<ValidateFunction> {
  const existing = compiled.get(schemaPath);
  if (existing) return existing;

  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(fromRepoRoot(schemaPath), "utf8"));
  } catch (cause) {
    throw new ConfigError(`Could not read schema ${schemaPath}`, { cause: String(cause) });
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const validator = ajv.compile(schema as object);
  compiled.set(schemaPath, validator);
  return validator;
}

export interface ValidationResult {
  valid: ChangelogEntry[];
  invalid: Array<{ entry: unknown; errors: string }>;
}

/** Validate extracted entries against the vendor's schema (CLAUDE.md §6). */
export function validateWith(validator: ValidateFunction, entries: unknown[]): ValidationResult {
  const result: ValidationResult = { valid: [], invalid: [] };

  for (const entry of entries) {
    if (validator(entry)) {
      result.valid.push(entry as ChangelogEntry);
    } else {
      const errors = (validator.errors ?? [])
        .map((e) => `${e.instancePath || "/"} ${e.message}`)
        .join("; ");
      result.invalid.push({ entry, errors });
    }
  }
  return result;
}

export async function validateEntries(entries: unknown[], schemaPath: string): Promise<ValidationResult> {
  return validateWith(await loadValidator(schemaPath), entries);
}
