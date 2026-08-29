/**
 * Running one side of the proof: check out a real commit, run today's tests against it,
 * and report what the code actually did.
 */

import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VendorStub } from "./vendor-stub.ts";

const run = promisify(execFile);

/** Strip terminal colour so the summary can be read. */
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

/** Raised when the proof cannot be trusted, rather than reported as a passing run. */
export class ProofError extends Error {
  readonly context: Record<string, unknown>;
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "ProofError";
    this.context = context;
  }
}

export interface RunResult {
  side: "before" | "after";
  sha: string;
  request: unknown;
  changedKey?: string;
  status: number;
  responseExcerpt: string;
  tests: { passed: number; failed: number; output: string };
  emulatedDate: string;
  at: string;
}

export interface RunOptions {
  root: string;
  side: "before" | "after";
  newModel: string;
  stub: VendorStub;
  stubPort: number;
  emulatedDate: string;
  emit: (chunk: unknown) => void;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * The commit that introduced the fix, and its parent.
 *
 * Found by searching for the commit that introduced the NEW model string. Taking the last
 * commit that happened to touch the file gives a parent that already contains the fix —
 * "before" and "after" would be the same code, and the proof would show two green columns
 * while appearing to work.
 */
export async function shas(root: string, newModel: string, file: string): Promise<{ before: string; after: string }> {
  const found = await git(["log", "-S", newModel, "--format=%H", "--", file], root);
  const fix = found.split("\n").filter(Boolean).at(-1);
  if (!fix) throw new ProofError(`No commit introduces ${newModel} in ${file}`, { newModel, file });

  const parent = await git(["rev-parse", `${fix}^`], root);
  if (!parent) throw new ProofError(`Commit ${fix} has no parent to compare against`, { fix });

  return { before: parent.slice(0, 7), after: fix.slice(0, 7) };
}

/**
 * A worktree at `sha` carrying TODAY's tests.
 *
 * Copying the current suite in is the experiment: running the old tests against the old
 * code proves nothing, because they agreed with each other. The copy is NOT allowed to
 * fail quietly — if it did, the run would grade old code by old expectations and present
 * that as the guarantee.
 */
async function worktreeAt(root: string, sha: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "uw-proof-"));
  await git(["worktree", "add", "--detach", dir, sha], root);

  try {
    await cp(join(root, "demo-app/test"), join(dir, "demo-app/test"), { recursive: true, force: true });
  } catch (cause) {
    await git(["worktree", "remove", "--force", dir], root).catch(() => undefined);
    throw new ProofError(
      "Could not copy today's tests into the worktree — the proof would grade old code by old expectations",
      { sha, cause: String(cause) },
    );
  }

  // pnpm keeps real directories under each package, so symlinking is enough to run vitest.
  // A fresh install per column would take minutes, and this has to feel immediate.
  for (const pkg of ["", "demo-app", "pipeline", "ui"]) {
    const from = join(root, pkg, "node_modules");
    const to = join(dir, pkg, "node_modules");
    if (existsSync(from) && !existsSync(to)) await symlink(from, to, "dir").catch(() => undefined);
  }

  return {
    dir,
    cleanup: async () => {
      await git(["worktree", "remove", "--force", dir], root).catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/**
 * Read vitest's own summary.
 *
 * Anchored on the "Tests" line: a bare /(\d+) passed/ matches "Test Files 3 passed" first
 * and reports the file count as the test count. A run with no summary at all did not fail
 * zero tests — it did not run, and reporting "0 failed" would dress a broken run as a pass.
 */
export function countTests(output: string): { passed: number; failed: number } {
  const clean = stripAnsi(output);
  const line = /^\s*Tests\s+(.+)$/m.exec(clean)?.[1];
  if (!line) {
    throw new ProofError("Test run produced no vitest summary — an invalid proof, not zero failures", {
      tail: clean.trim().split("\n").slice(-8).join("\n"),
    });
  }

  return {
    passed: Number(/(\d+) passed/.exec(line)?.[1] ?? 0),
    failed: Number(/(\d+) failed/.exec(line)?.[1] ?? 0),
  };
}

export async function runSide(options: RunOptions): Promise<RunResult> {
  const { root, side, newModel, stub, stubPort, emulatedDate, emit } = options;
  const file = "demo-app/src/risk.ts";
  const sha = (await shas(root, newModel, file))[side];

  const tree = await worktreeAt(root, sha);
  stub.reset();

  let output: string;
  try {
    const { stdout, stderr } = await run("pnpm", ["--filter", "demo-app", "test"], {
      cwd: tree.dir,
      env: {
        ...process.env,
        OPENAI_API_BASE: `http://127.0.0.1:${stubPort}`,
        PROOF_RUN: "1", // switches on the one test that really calls the vendor
        CI: "true",
      },
      maxBuffer: 20 * 1024 * 1024,
    });
    output = `${stdout}\n${stderr}`;
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  } finally {
    await tree.cleanup();
  }

  // The request the CHECKED-OUT CODE actually sent, recorded by the stub as it arrived.
  // Composing one here would put a receipt on screen that no commit ever produced.
  const call = stub.calls.at(-1);
  if (!call) {
    throw new ProofError(`Commit ${sha} never called the vendor, so there is nothing to show`, { sha, side });
  }

  emit({ phase: "request", data: call.request });
  emit({ phase: "response", data: { status: call.status, excerpt: call.excerpt } });

  const counts = countTests(output);
  const tests = { ...counts, output: stripAnsi(output).trim().split("\n").slice(-25).join("\n") };
  emit({ phase: "tests", data: tests });

  return {
    side,
    sha,
    request: call.request,
    changedKey: "model",
    status: call.status,
    responseExcerpt: call.excerpt,
    tests,
    emulatedDate,
    at: new Date().toISOString(),
  };
}
