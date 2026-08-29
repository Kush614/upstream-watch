import { appendFile } from "node:fs/promises";
import { fromRepoRoot } from "./paths.ts";

/**
 * Append a failure to NOTES.md (CLAUDE.md §2.5, §7). That file is the blog source, so
 * entries follow the format at the top of it.
 *
 * Never throws: a logging failure must not take down a run.
 */
export async function appendNote(note: {
  summary: string;
  where: string;
  symptom: string;
  cause?: string;
  fix?: string;
  lesson?: string;
}): Promise<void> {
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
