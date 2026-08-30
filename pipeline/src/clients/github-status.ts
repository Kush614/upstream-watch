/**
 * Commit statuses on GitHub.
 *
 * Every external call goes through a client with typed responses (CLAUDE.md §7). This one
 * exists so the verification appears inside the pull request, where a reviewer already
 * looks, instead of only in a UI they have never run.
 *
 * Statuses rather than the Checks API: Checks needs `checks:write`, which in practice means
 * a GitHub App. A status works with the token `gh` already holds and renders in the same
 * place for the reader.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UpstreamWatchError } from "../errors.ts";

const run = promisify(execFile);

export class StatusError extends UpstreamWatchError {}

export type StatusState = "success" | "failure" | "pending" | "error";

export interface StatusInput {
  pr: number;
  state: StatusState;
  /** GitHub truncates past 140 characters without saying so. */
  description: string;
  targetUrl?: string;
  context?: string;
}

const LIMIT = 140;

export async function headSha(pr: number): Promise<string> {
  let stdout: string;
  try {
    ({ stdout } = await run("gh", ["pr", "view", String(pr), "--json", "headRefOid", "--jq", ".headRefOid"]));
  } catch (cause) {
    throw new StatusError(`could not read PR #${pr}`, { pr, cause: String(cause) });
  }

  const sha = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new StatusError(`PR #${pr} returned no head sha`, { pr, sha });
  return sha;
}

export async function repoSlug(): Promise<string> {
  const { stdout } = await run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  return stdout.trim();
}

export async function postStatus(input: StatusInput): Promise<{ sha: string; context: string }> {
  const context = input.context ?? "upstream-watch / live-vendor-behaviour";

  if (input.description.length > LIMIT) {
    // Truncating here would leave half a sentence on the pull request; the caller should
    // shorten it deliberately rather than have it clipped.
    throw new StatusError(`status description is ${input.description.length} characters, over GitHub's ${LIMIT}`, {
      length: input.description.length,
    });
  }

  const sha = await headSha(input.pr);
  const slug = await repoSlug();

  const args = [
    "api", "--method", "POST", `repos/${slug}/statuses/${sha}`,
    "-f", `state=${input.state}`,
    "-f", `context=${context}`,
    "-f", `description=${input.description}`,
  ];
  if (input.targetUrl) args.push("-f", `target_url=${input.targetUrl}`);

  try {
    await run("gh", args);
  } catch (cause) {
    const e = cause as { stderr?: string };
    throw new StatusError(`posting the status failed: ${(e.stderr ?? String(cause)).trim().slice(0, 200)}`, {
      pr: input.pr, sha, context,
    });
  }

  return { sha, context };
}
