import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UpstreamWatchError } from "../errors.ts";
import { withApproval, type ApprovalOptions, type GatedResult } from "../lib/approval.ts";
import { REPO_ROOT } from "../lib/paths.ts";

const run = promisify(execFile);

/**
 * GitHub client backed by the `gh` CLI.
 *
 * The intended path is the GitHub MCP connector, driven by the orchestrator inside
 * TrueForge. This is the fallback `docs/PLAN.md` calls for when OAuth is unavailable —
 * same operations, same approval gate, driven from the terminal instead.
 *
 * Say which one you used out loud in the pitch; do not imply MCP when this ran.
 */

export class GitHubError extends UpstreamWatchError {}

async function gh(args: string[], cwd = REPO_ROOT): Promise<string> {
  try {
    const { stdout } = await run("gh", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new GitHubError(`gh ${args[0]} failed`, { args, stderr: err.stderr ?? err.message });
  }
}

async function git(args: string[], cwd = REPO_ROOT): Promise<string> {
  try {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    throw new GitHubError(`git ${args[0]} failed`, { args, stderr: err.stderr ?? err.message });
  }
}

/**
 * Run git with input on stdin.
 *
 * `git apply -` reads the patch from stdin and blocks until the stream closes, so calling
 * it without writing anything hangs rather than validating. That is worth its own helper:
 * both the check and the apply need it, and using the plain `git()` above silently does
 * the wrong thing.
 */
async function gitWithStdin(args: string[], input: string, cwd = REPO_ROOT): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, _out, stderr) =>
      error
        ? reject(new GitHubError(`git ${args.join(" ")} failed`, { stderr: String(stderr).slice(0, 500) }))
        : resolve(),
    );
    child.stdin?.end(input);
  });
}

export interface OpenPrInput {
  branch: string;
  base: string;
  title: string;
  body: string;
  draft: boolean;
  /** Unified diff from the patcher subagent (specs/patcher.md §Output). */
  diff: string;
  commitMessage: string;
}

export interface PrRef {
  number: number;
  url: string;
}

export interface GitHubClient {
  currentRepo(): Promise<string>;
  openPr(input: OpenPrInput): Promise<PrRef>;
  commentOnPr(prNumber: number, body: string): Promise<void>;
  mergePr(prNumber: number, options: ApprovalOptions): Promise<GatedResult<PrRef>>;
}

export class GhCliClient implements GitHubClient {
  async currentRepo(): Promise<string> {
    return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  }

  /**
   * Apply the patcher's diff on a fresh branch and open a PR.
   *
   * Opening a PR is reversible and therefore ungated (specs/agent.md §Approvals). The diff
   * is applied with `git apply --check` first so a bad patch fails before anything is
   * committed, let alone pushed.
   */
  async openPr(input: OpenPrInput): Promise<PrRef> {
    const startingPoint = await git(["rev-parse", "--abbrev-ref", "HEAD"]);

    // `checkout -B` resets an existing branch to base, destroying its tip. A retry after a
    // half-finished run would silently discard the earlier attempt, so refuse instead.
    const exists = await git(["branch", "--list", input.branch]);
    if (exists.trim()) {
      throw new GitHubError(
        `branch "${input.branch}" already exists — refusing to reset it. ` +
          `Delete it or choose another name.`,
        { branch: input.branch },
      );
    }

    try {
      await git(["checkout", "-q", "-b", input.branch, input.base]);

      if (input.diff.trim()) {
        // Validate before mutating the working tree. `--check` reads the patch on stdin.
        await gitWithStdin(["apply", "--check", "-"], input.diff).catch(() => {
          throw new GitHubError("patch does not apply cleanly", { branch: input.branch });
        });
        await gitWithStdin(["apply", "-"], input.diff);
      }

      await git(["add", "-A"]);
      await git(["commit", "-q", "-m", input.commitMessage]);
      await git(["push", "-q", "-u", "origin", input.branch]);

      const url = await gh([
        "pr", "create",
        "--base", input.base,
        "--head", input.branch,
        "--title", input.title,
        "--body", input.body,
        ...(input.draft ? ["--draft"] : []),
      ]);

      const number = Number(url.split("/").pop());
      return { number, url };
    } finally {
      await git(["checkout", "-q", startingPoint]).catch(() => undefined);
    }
  }

  async commentOnPr(prNumber: number, body: string): Promise<void> {
    await gh(["pr", "comment", String(prNumber), "--body", body]);
  }

  /**
   * Merge — the irreversible step.
   *
   * Gated by `{ approved: true }` and dry-run by default (CLAUDE.md §2.3, §7). Without
   * approval this reports what it *would* do and changes nothing on GitHub.
   */
  async mergePr(prNumber: number, options: ApprovalOptions): Promise<GatedResult<PrRef>> {
    return withApproval(
      "merge-pr",
      `Merge PR #${prNumber} into its base branch`,
      options,
      async () => {
        await gh(["pr", "merge", String(prNumber), "--squash", "--delete-branch"]);
        const url = await gh(["pr", "view", String(prNumber), "--json", "url", "--jq", ".url"]);
        return { number: prNumber, url };
      },
    );
  }
}
