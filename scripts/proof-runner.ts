/**
 * The proof runner's HTTP surface.
 *
 * It answers one question honestly: *does your code still work on the day the vendor turns
 * this off?* The vendor emulation lives in ./proof/vendor-stub.ts, the git/vitest execution
 * in ./proof/run-side.ts — this file only wires them to routes and to disk.
 *
 *   pnpm proof            # serves on :8791
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VendorStub } from "./proof/vendor-stub.ts";
import { ProofError, runSide, type RunResult } from "./proof/run-side.ts";
import { appendNote } from "../pipeline/src/lib/notes.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PROOF_PORT ?? 8791);
const STUB_PORT = Number(process.env.PROOF_STUB_PORT ?? 8792);

const SHUTDOWN = "2026-12-11";
const OLD_MODEL = "gpt-5-mini-2025-08-07";
const NEW_MODEL = "gpt-5.6-terra";

/** Results survive a restart: the UI promises a refresh shows the same screen. */
const STATE_FILE = join(ROOT, "ui/public/last-run.json");

interface State {
  emulatedDate: string;
  before?: RunResult;
  after?: RunResult;
}

let state: State = { emulatedDate: SHUTDOWN };

async function loadState(): Promise<void> {
  try {
    state = { ...state, ...(JSON.parse(await readFile(STATE_FILE, "utf8")) as State) };
    console.log(`  restored last run (${state.before ? "before " : ""}${state.after ? "after" : ""})`);
  } catch {
    // No previous run is the normal first-start case.
  }
}

async function saveState(): Promise<void> {
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8").catch(() => undefined);
}

const stub = new VendorStub({
  port: STUB_PORT,
  shutdownDate: SHUTDOWN,
  retiredModel: OLD_MODEL,
  emulatedDate: () => state.emulatedDate,
});

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

/** Every top-level failure is written to NOTES.md (CLAUDE.md §7, §2.5). */
async function logFailure(route: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await appendNote({
    summary: `proof runner ${route} failed: ${message.slice(0, 60)}`,
    where: "scripts/proof-runner.ts",
    symptom: message,
    cause: error instanceof ProofError ? JSON.stringify(error.context) : undefined,
  });
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
      if (date && date !== state.emulatedDate) {
        // Results belong to the date they were produced for. Keeping them would show an
        // outage beside a pre-shutdown slider, or a green column past the shutdown.
        state = { emulatedDate: date };
        await saveState();
      }
      return json(res, 200, { emulatedDate: state.emulatedDate, cleared: true });
    }

    if (path === "/last") return json(res, 200, state);

    if (path === "/run" && req.method === "POST") {
      const side = url.searchParams.get("side") === "before" ? "before" : "after";
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson");

      try {
        // Newline-delimited JSON: each phase reaches the column the moment it happens.
        const result = await runSide({
          root: ROOT, side, newModel: NEW_MODEL, stub, stubPort: STUB_PORT,
          emulatedDate: state.emulatedDate,
          emit: (chunk) => res.write(`${JSON.stringify(chunk)}\n`),
        });
        state[side] = result;
        await saveState();
      } catch (error) {
        await logFailure(`/run?side=${side}`, error);
        res.write(`${JSON.stringify({ phase: "error", data: { message: error instanceof Error ? error.message : String(error) } })}\n`);
      }
      return res.end();
    }

    return json(res, 404, { error: `no route ${path}` });
  } catch (error) {
    await logFailure(path, error);
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, async () => {
  await loadState();
  await stub.start();
  console.log(`\n  proof runner on :${PORT}`);
  console.log(`  emulated vendor on :${STUB_PORT} — behaving as ${SHUTDOWN} onwards\n`);
});
