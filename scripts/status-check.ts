/**
 * Put the verification inside GitHub, not only in our own UI.
 *
 *   pnpm status:post --pr 13 --state success --description "..."
 *
 * The GitHub call itself lives in pipeline/src/clients/github-status.ts (CLAUDE.md §7);
 * this file is the command line around it.
 */

import { postStatus, StatusError, type StatusState } from "../pipeline/src/clients/github-status.ts";
import { appendNote } from "../pipeline/src/lib/notes.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const pr = Number(flag("pr"));
  const state = (flag("state") ?? "success") as StatusState;
  const description = flag("description");

  if (!Number.isInteger(pr) || !description) {
    throw new StatusError("usage: pnpm status:post --pr <n> --state <success|failure> --description <text>");
  }

  const { sha, context } = await postStatus({ pr, state, description, targetUrl: flag("url") });
  console.log(`  ${context}: ${state} on ${sha.slice(0, 7)} (PR #${pr})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    // A status that silently failed to post leaves the PR looking unverified while we
    // believe it is verified — worth writing down (CLAUDE.md §2.5).
    await appendNote({
      summary: `status:post failed: ${message.slice(0, 60)}`,
      where: "scripts/status-check.ts",
      symptom: message,
    }).catch(() => undefined);
    process.exitCode = 1;
  });
}
