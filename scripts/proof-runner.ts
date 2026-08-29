/**
 * The proof runner — the backend for the two columns.
 *
 * It answers one question honestly: *does your code still work on the day the vendor turns
 * this off?* To do that it needs two things the rest of the system does not provide.
 *
 *  1. A vendor that behaves like the future. `demo-app` reads its API base from the
 *     environment (`OPENAI_API_BASE`), so a stub stands in for OpenAI and returns the real
 *     shutdown error once the emulated date passes. **This is the one emulated thing on the
 *     screen, and the UI says so.**
 *  2. The code as it was, and as it is. A git worktree at each commit, so "before" is
 *     genuinely the old code rather than a screenshot of it.
 *
 * Everything else — the request, the status, the test run — actually happens.
 *
 *   pnpm proof            # serves on :8791
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.PROOF_PORT ?? 8791);
const STUB_PORT = Number(process.env.PROOF_STUB_PORT ?? 8792);

/** The change under test. Both commits are real and on this branch's history. */
const SHUTDOWN = "2026-12-11";
const OLD_MODEL = "gpt-5-mini-2025-08-07";
const NEW_MODEL = "gpt-5.6-terra";

interface RunResult {
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

const state: { emulatedDate: string; before?: RunResult; after?: RunResult } = {
  emulatedDate: SHUTDOWN,
};

/* ─────────────────────── the emulated vendor ───────────────────────────── */

/**
 * Stands in for OpenAI. Before the shutdown date it accepts everything; on or after it,
 * a request naming the retired model gets the error OpenAI actually returns.
 */
function startStub(): void {
  createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let model = "";
      try {
        model = (JSON.parse(body || "{}") as { model?: string }).model ?? "";
      } catch {
        /* a malformed body is the caller's problem, not ours */
      }

      const retired = model === OLD_MODEL && state.emulatedDate >= SHUTDOWN;
      res.setHeader("content-type", "application/json");

      if (retired) {
        res.statusCode = 400;
        res.end(JSON.stringify({
          error: {
            message: `The model \`${OLD_MODEL}\` has been shut down. Learn more: https://platform.openai.com/docs/deprecations`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        }));
        return;
      }

      res.statusCode = 200;
      res.end(JSON.stringify({
        id: "resp_proof",
        output_text: "low — small amount, familiar country",
      }));
    });
  }).listen(STUB_PORT, () => console.log(`  emulated vendor on :${STUB_PORT}`));
}

/* ──────────────────────── running one side ─────────────────────────────── */

async function git(args: string[], cwd = ROOT): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * The commit that introduced the fix, and its parent.
 *
 * Found by searching for the commit that introduced the NEW model string, not by taking the
 * last commit that happened to touch the file — several later commits touch risk.ts for
 * unrelated reasons, and their parents still contain the fix, which would make "before"
 * identical to "after" and quietly prove nothing.
 */
async function shas(): Promise<{ before: string; after: string }> {
  const found = await git(["log", "-S", NEW_MODEL, "--format=%H", "--", "demo-app/src/risk.ts"]);
  const fix = found.split("\n").filter(Boolean).at(-1);
  if (!fix) throw new Error(`no commit introduces ${NEW_MODEL} in demo-app/src/risk.ts`);

  const parent = await git(["rev-parse", `${fix}^`]);
  return { before: parent.slice(0, 7), after: fix.slice(0, 7) };
}

/**
 * A worktree at `sha` that can run tests without a fresh install.
 *
 * pnpm puts real directories under each package's node_modules, so symlinking them into
 * the worktree is enough to run vitest — an install per column would take minutes and this
 * has to feel immediate.
 */
async function worktreeAt(sha: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "uw-proof-"));
  await git(["worktree", "add", "--detach", dir, sha]);

  // Today's expectations, yesterday's code. Copying the current test suite in is the point
  // of the experiment: "would the code we shipped then still satisfy what we assert now?"
  // Running the old tests against the old code proves nothing — they agreed with each other.
  await run("cp", ["-R", join(ROOT, "demo-app/test"), join(dir, "demo-app/")]).catch(() => undefined);

  for (const pkg of ["", "demo-app", "pipeline", "ui"]) {
    const from = join(ROOT, pkg, "node_modules");
    const to = join(dir, pkg, "node_modules");
    if (existsSync(from) && !existsSync(to)) {
      await symlink(from, to, "dir").catch(() => undefined);
    }
  }

  return {
    dir,
    cleanup: async () => {
      await git(["worktree", "remove", "--force", dir]).catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/**
 * Read vitest's own summary.
 *
 * Anchored on the "Tests" line: a bare /(\d+) passed/ matches "Test Files 3 passed" first
 * and reports the number of files as the number of tests.
 */
function countTests(output: string): { passed: number; failed: number } {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  const line = /^\s*Tests\s+(.+)$/m.exec(clean)?.[1] ?? clean;
  return {
    passed: Number(/(\d+) passed/.exec(line)?.[1] ?? 0),
    failed: Number(/(\d+) failed/.exec(line)?.[1] ?? 0),
  };
}

/** The request `demo-app` sends, issued for real against the stub. */
async function callVendor(model: string): Promise<{ request: unknown; status: number; excerpt: string }> {
  const request = { model, input: "Assess fraud risk for a card payment…", store: false };

  const res = await fetch(`http://127.0.0.1:${STUB_PORT}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  const text = await res.text();
  let excerpt = text;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    excerpt = parsed.error?.message ?? text;
  } catch {
    /* keep the raw body */
  }

  return { request, status: res.status, excerpt };
}

async function runSide(side: "before" | "after", emit: (c: unknown) => void): Promise<RunResult> {
  const { before, after } = await shas();
  const sha = side === "before" ? before : after;
  const model = side === "before" ? OLD_MODEL : NEW_MODEL;

  const call = await callVendor(model);
  emit({ phase: "request", data: call.request });
  emit({ phase: "response", data: { status: call.status, excerpt: call.excerpt } });

  const tree = await worktreeAt(sha);
  let output: string;
  try {
    const { stdout, stderr } = await run("pnpm", ["--filter", "demo-app", "test"], {
      cwd: tree.dir,
      env: {
        ...process.env,
        OPENAI_API_BASE: `http://127.0.0.1:${STUB_PORT}`,
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

  const tests = countTests(output);
  emit({ phase: "tests", data: { ...tests, output: output.trim().split("\n").slice(-25).join("\n") } });

  const result: RunResult = {
    side, sha,
    request: call.request,
    changedKey: "model",
    status: call.status,
    responseExcerpt: call.excerpt,
    tests: { ...tests, output: output.trim().split("\n").slice(-25).join("\n") },
    emulatedDate: state.emulatedDate,
    at: new Date().toISOString(),
  };

  state[side] = result;
  await writeFile(join(ROOT, "ui/public/last-run.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8").catch(() => undefined);
  return result;
}

/* ──────────────────────────── the server ───────────────────────────────── */

function json(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/proof/, "") || "/";

  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    if (path === "/date" && req.method === "POST") {
      const { date } = JSON.parse((await readBody(req)) || "{}") as { date?: string };
      if (date) state.emulatedDate = date;
      return json(res, 200, { emulatedDate: state.emulatedDate });
    }

    if (path === "/last") {
      return json(res, 200, state);
    }

    if (path === "/run" && req.method === "POST") {
      const side = url.searchParams.get("side") === "before" ? "before" : "after";
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson");
      // Newline-delimited JSON: each phase reaches the column the moment it happens.
      await runSide(side, (chunk) => res.write(`${JSON.stringify(chunk)}\n`));
      return res.end();
    }

    return json(res, 404, { error: `no route ${path}` });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, () => {
  console.log(`\n  proof runner on :${PORT}`);
  startStub();
  console.log(`  emulating vendor behaviour from ${SHUTDOWN}\n`);
});
