/**
 * Put the verification inside GitHub, not only in our own UI.
 *
 *   pnpm status:post --pr 13 --state success --description "..."
 *
 * A reviewer looking at the pull request should be able to see whether the fix was checked
 * against the live upstream without being asked to trust a screenshot from a tool they have
 * never run. This posts a commit status, which renders in the PR's own check list.
 *
 * Statuses, not the Checks API: Checks needs `checks:write`, which in practice means a
 * GitHub App. A commit status works with the token `gh` already holds, and appears in the
 * same place for the reader.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UpstreamWatchError } from "../pipeline/src/errors.ts";

const run = promisify(execFile);

export class StatusError extends UpstreamWatchError {}

export type StatusState = "success" | "failure" | "pending" | "error";

export interface StatusInput {
  pr: number;
  state: StatusState;
  /** Max 140 characters — GitHub truncates silently past that. */
  description: string;
  targetUrl?: string;
  context?: string;
}

const LIMIT = 140;

/** The head commit of a pull request, which is what a status attaches to. */
export async function headSha(pr: number): Promise<string> {
  try {
    const { stdout } = await run("gh", ["pr", "view", String(pr), "--json", "headRefOid", "--jq", ".headRefOid"]);
    const sha = stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new StatusError(`PR #${pr} returned no head sha`, { pr, sha });
    return sha;
  } catch (cause) {
    if (cause instanceof StatusError) throw cause;
    throw new StatusError(`could not read PR #${pr}`, { pr, cause: String(cause) });
  }
}

export async function repoSlug(): Promise<string> {
  const { stdout } = await run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  return stdout.trim();
}

export async function post(input: StatusInput): Promise<void> {
  const { pr, state, description, targetUrl } = input;
  const context = input.context ?? "upstream-watch / live-vendor-behaviour";

  if (description.length > LIMIT) {
    // Truncating here would put a half-sentence on the PR; the caller should shorten it.
    throw new StatusError(`status description is ${description.length} characters, over GitHub's ${LIMIT}`, {
      length: description.length,
    });
  }

  const sha = await headSha(pr);
  const slug = await repoSlug();

  const args = [
    "api",
    "--method", "POST",
    `repos/${slug}/statuses/${sha}`,
    "-f", `state=${state}`,
    "-f", `context=${context}`,
    "-f", `description=${description}`,
  ];
  if (targetUrl) args.push("-f", `target_url=${targetUrl}`);

  try {
    await run("gh", args);
  } catch (cause) {
    const e = cause as { stderr?: string };
    throw new StatusError(`posting the status failed: ${(e.stderr ?? String(cause)).trim().slice(0, 200)}`, {
      pr, sha, context,
    });
  }
}

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

  await post({ pr, state, description, targetUrl: flag("url") });
  console.log(`  posted ${state} to PR #${pr}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
