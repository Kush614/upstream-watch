/**
 * Running one side of the proof: check out a real commit, run today's tests against it,
 * and report what the code actually did.
 */

import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
  citations: Citation[];
  at: string;
}

/**
 * One claim on the screen, and the thing that backs it.
 *
 * Every field here is read back from something that happened — a line in a commit, a
 * request that was sent, a status that came back. Nothing is written by hand, because a
 * citation you can compose is worth less than no citation at all.
 */
export interface Citation {
  /** What the reader is being asked to believe. */
  claim: string;
  /** The literal evidence, quoted. */
  evidence: string;
  /** Where that evidence came from, in words a non-engineer can follow. */
  source: string;
  /** Somewhere the reader can go and check for themselves. */
  url?: string;
}

/** The vendor's own announcement, when a live scrape found one. */
export interface ChangelogCitation {
  date: string;
  title: string;
  url: string;
  body: string;
}

export interface RunOptions {
  root: string;
  side: "before" | "after";
  oldModel: string;
  newModel: string;
  /** Omitted when the live scrape found nothing: a missing citation beats an invented one. */
  changelog?: ChangelogCitation;
  emit: (chunk: unknown) => void;
}

/** What `demo-app/test/proof-receipt.ts` writes down as the call happens. */
interface Receipt {
  request: { method: string; url: string; body: unknown };
  status: number;
  excerpt: string;
  at: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * The commit that carried out the migration, and its parent.
 *
 * Picking this by heuristic is where the proof quietly dies: choose the commit that merely
 * last touched the file and the parent already contains the fix, so both columns come back
 * green and the screen looks like it worked. This repo has now migrated TO `gpt-5.6-terra`
 * more than once, so "the oldest commit introducing the new model" is wrong too — it finds
 * a parent pinned to a model that still answers.
 *
 * So: take the most recent commit that introduced the new model, then VERIFY the parent is
 * actually pinned to the retired one. If it is not, this is not the migration we claim to
 * be proving, and saying so is better than rendering two green columns.
 */
export async function shas(
  root: string,
  oldModel: string,
  newModel: string,
  file: string,
): Promise<{ before: string; after: string }> {
  const found = await git(["log", "-S", `RISK_MODEL = "${newModel}"`, "--format=%H", "--", file], root);
  const fix = found.split("\n").filter(Boolean).at(0);
  if (!fix) throw new ProofError(`No commit pins ${file} to ${newModel}`, { newModel, file });

  const parent = await git(["rev-parse", `${fix}^`], root);
  if (!parent) throw new ProofError(`Commit ${fix} has no parent to compare against`, { fix });

  const parentSource = await git(["show", `${parent}:${file}`], root);
  if (!parentSource.includes(`RISK_MODEL = "${oldModel}"`)) {
    throw new ProofError(
      `The commit before the fix is not pinned to ${oldModel}, so this is not the migration being proved`,
      { fix: fix.slice(0, 7), parent: parent.slice(0, 7), oldModel, newModel },
    );
  }

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
  const { root, side, oldModel, newModel, changelog, emit } = options;
  const file = "demo-app/src/risk.ts";
  const sha = (await shas(root, oldModel, newModel, file))[side];

  if (!process.env.OPENAI_API_KEY) {
    throw new ProofError("No OPENAI_API_KEY — this proof calls the real API and will not pretend otherwise", { side });
  }

  const tree = await worktreeAt(root, sha);
  // Each side writes its receipt inside its own worktree, so two columns running at once
  // cannot read each other's call. The two runs are deliberately concurrent.
  const receiptPath = join(tree.dir, "proof-receipt.json");

  let output: string;
  try {
    const { stdout, stderr } = await run("pnpm", ["--filter", "demo-app", "test"], {
      cwd: tree.dir,
      env: {
        ...process.env,
        PROOF_RUN: "1", // switches on the one test that really calls OpenAI
        PROOF_RECEIPT: receiptPath,
        CI: "true",
      },
      maxBuffer: 20 * 1024 * 1024,
    });
    output = `${stdout}\n${stderr}`;
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    output = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }

  // The exchange the CHECKED-OUT CODE actually had with OpenAI, observed as it happened.
  // Read before cleanup, because cleanup deletes the worktree it lives in.
  let receipt: Receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8")) as Receipt;
  } catch (cause) {
    throw new ProofError(
      `Commit ${sha} never reached OpenAI, so there is no receipt to show`,
      { sha, side, cause: String(cause) },
    );
  } finally {
    await tree.cleanup();
  }

  // Read the pinned line out of the commit itself rather than assuming which model it used.
  const pinnedLine =
    (await git(["show", `${sha}:${file}`], root))
      .split("\n")
      .find((l) => l.includes("RISK_MODEL ="))
      ?.trim() ?? "";

  emit({ phase: "request", data: receipt.request });
  emit({ phase: "response", data: { status: receipt.status, excerpt: receipt.excerpt } });

  const counts = countTests(output);
  const tests = { ...counts, output: stripAnsi(output).trim().split("\n").slice(-25).join("\n") };
  emit({ phase: "tests", data: tests });

  const citations = citationsFor({ side, sha, file, pinnedLine, receipt, counts, changelog, oldModel });
  emit({ phase: "citations", data: citations });

  return {
    side,
    sha,
    request: receipt.request,
    changedKey: "model",
    status: receipt.status,
    responseExcerpt: receipt.excerpt,
    tests,
    citations,
    at: new Date().toISOString(),
  };
}

/**
 * Turn what happened into a chain a reader can follow, one link at a time:
 * the vendor said → this commit does → so the call was → and the vendor answered → so N tests.
 */
function citationsFor(args: {
  side: "before" | "after";
  sha: string;
  file: string;
  pinnedLine: string;
  receipt: Receipt;
  counts: { passed: number; failed: number };
  changelog?: ChangelogCitation;
  oldModel: string;
}): Citation[] {
  const { side, sha, file, pinnedLine, receipt, counts, changelog, oldModel } = args;
  const model = (receipt.request.body as { model?: string } | undefined)?.model ?? "an unnamed model";
  const out: Citation[] = [];

  if (changelog) {
    out.push({
      claim: `OpenAI retired ${oldModel} on ${changelog.date}.`,
      evidence: changelog.body.trim().slice(0, 200),
      source: "Scraped live from OpenAI's deprecations page during this run.",
      url: changelog.url,
    });
  }

  out.push({
    claim: `This commit asks for ${model}.`,
    evidence: pinnedLine || `(no RISK_MODEL line found in ${file})`,
    source: `Read out of commit ${sha} — ${file}, not from anything typed here.`,
  });

  out.push({
    claim:
      receipt.status === 200
        ? "OpenAI accepted the request."
        : `OpenAI refused the request with ${receipt.status}.`,
    evidence: receipt.excerpt,
    source: `The reply to the ${receipt.request.method} this commit's own test sent to ${receipt.request.url}.`,
    url: receipt.request.url,
  });

  out.push({
    claim:
      counts.failed > 0
        ? `${counts.failed} of this service's tests fail as a result.`
        : `All ${counts.passed} of this service's tests pass.`,
    evidence: `${counts.passed} passed, ${counts.failed} failed`,
    source: `vitest, run against commit ${sha} with today's test suite — the ${side} column.`,
  });

  return out;
}
