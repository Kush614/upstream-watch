import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file rather than cwd so scripts work from anywhere. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Resolve a repo-relative path (as written in targets.yaml) to an absolute one. */
export function fromRepoRoot(...parts: string[]): string {
  return resolve(REPO_ROOT, ...parts);
}
