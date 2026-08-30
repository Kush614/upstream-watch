import { appendFile } from "node:fs/promises";
import { fromRepoRoot } from "./paths.ts";

/**
 * Append a failure to NOTES.md (CLAUDE.md §2.5, §7). That file is the blog source, so
 * entries follow the format at the top of it.
 *
 * **Dev and demo only**, which is what CLAUDE.md §7 asks for and also the only safe
 * reading: NOTES.md is a tracked file in the working tree. A deployed run appending to it
 * would be writing to the repository as a side effect of an error — mutating source from
 * production, and in a checkout it does not own. Set `UPSTREAM_WATCH_NOTES=0` to silence it
 * anywhere, and `NODE_ENV=production` silences it by default.
 *
 * Never throws: a logging failure must not take down a run.
 */
function notesEnabled(): boolean {
  const explicit = process.env.UPSTREAM_WATCH_NOTES;
  if (explicit !== undefined) return explicit !== "0" && explicit !== "false";

  // Opt IN, not opt out. "NODE_ENV is not production" also covers CI, a test run, a
  // container with no NODE_ENV at all, and anywhere someone deployed without setting it —
  // none of which should be appending to a tracked file in a checkout they do not own.
  const env = process.env.NODE_ENV;
  if (process.env.CI === "true" || process.env.VITEST) return false;
  return env === "development" || env === undefined && process.env.UPSTREAM_WATCH_DEV === "1";
}

export async function appendNote(note: {
  summary: string;
  where: string;
  symptom: string;
  cause?: string;
  fix?: string;
  lesson?: string;
}): Promise<void> {
  if (!notesEnabled()) return;

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const block = [
    ``,
    `## ${stamp} - ${note.summary}`,
    ``,
    `**Where:** ${note.where}`,
    `**Symptom:** ${note.symptom}`,
    `**Cause:** ${note.cause ?? "_TBD_"}`,
    `**Fix:** ${note.fix ?? "_TBD_"}`,
    `**Lesson:** ${note.lesson ?? "_TBD_"}`,
    ``,
  ].join("\n");

  try {
    await appendFile(fromRepoRoot("NOTES.md"), block, "utf8");
  } catch {
    // Logging must never be the reason a run dies.
  }
}
