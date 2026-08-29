// The schema declares draft 2020-12, so it needs the 2020 build of Ajv - the default
// export only knows draft-07 and rejects the $schema outright.
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../schemas/changelog-entry.json" with { type: "json" };
import type { ChangelogEntry } from "../types.ts";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validator: ValidateFunction = ajv.compile(schema);

export interface ValidationResult {
  valid: ChangelogEntry[];
  invalid: Array<{ entry: unknown; errors: string }>;
}

/** Validate extracted entries against schemas/changelog-entry.json (CLAUDE.md §6). */
export function validateEntries(entries: unknown[]): ValidationResult {
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
