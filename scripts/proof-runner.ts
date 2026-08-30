/**
 * The proof runner's HTTP surface.
 *
 * It answers one question, and nothing on the screen is emulated: *what happens when this
 * code calls OpenAI today?* `gpt-5.1-codex-mini` was shut down on 2026-07-23, so the commit
 * pinned to it gets a real 404 from api.openai.com, and the commit the agent patched gets a
 * real 200. There is no stub and no emulated date — the deprecation already happened.
 *
 * The git/vitest execution lives in ./proof/run-side.ts; this file only wires it to routes
 * and to disk.
 *
 *   pnpm proof            # serves on :8791
 */

import { createServer, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProofError, runSide, type ChangelogCitation, type RunResult } from "./proof/run-side.ts";
import { WatchlistError, check, rows } from "./proof/watchlist.ts";
import { appendNote } from "../pipeline/src/lib/notes.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PROOF_PORT ?? 8791);

/** The migration being proved, exactly as OpenAI's deprecations page records it. */
const SHUTDOWN = "2026-07-23";
const OLD_MODEL = "gpt-5.1-codex-mini";
const NEW_MODEL = "gpt-5.6-terra";

/** Results survive a restart: the UI promises a refresh shows the same screen. */
const STATE_FILE = join(ROOT, "ui/public/last-run.json");

interface State {
  before?: RunResult;
  after?: RunResult;
}

let state: State = {};

/**
 * OpenAI's own announcement of this shutdown, scraped live once per process.
 *
 * Cached because a scrape takes tens of seconds and both columns cite the same entry. If
 * the scrape finds nothing, the columns render without this citation rather than with a
 * sentence we wrote ourselves.
 */
let changelogLookup: Promise<ChangelogCitation | undefined> | undefined;

async function changelogCitation(): Promise<ChangelogCitation | undefined> {
  // Cache the PROMISE, not a "tried" flag. Both columns run concurrently, and a flag set
  // before the await let the second run through with undefined while the first was still
  // scraping — one column cited the vendor and the other silently did not.
  changelogLookup ??= (async () => {
    const result = await check(ROOT, "openai");
    const hit = result.matches.find((m) => m.title.includes(OLD_MODEL));
    return hit ? { date: hit.date, title: hit.title, url: hit.url, body: hit.body } : undefined;
  })();

  try {
    return await changelogLookup;
  } catch (error) {
    await logFailure("changelog citation", error);
    // Do not cache the failure for the life of the process: a scrape that failed once
    // because the network blinked should not silence the citation until a restart.
    changelogLookup = undefined;
    return undefined;
  }
}

async function loadState(): Promise<void> {
  try {
    state = { ...state, ...(JSON.parse(await readFile(STATE_FILE, "utf8")) as State) };
    console.log(`  restored last run (${state.before ? "before " : ""}${state.after ? "after" : ""})`);
  } catch {
    // No previous run is the normal first-start case.
  }
}

/**
 * Persist the run so a refresh shows the same screen.
 *
 * A swallowed failure here is quietly serious: the response still says the run succeeded,
 * but the next start restores an older run — or none — under the same heading. So the
 * failure is logged rather than dropped. It is deliberately NOT thrown: the run really did
 * happen and the columns on screen are real, so losing durability must not erase them.
 */
async function saveState(): Promise<void> {
  try {
    await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  } catch (error) {
    await logFailure("state write", error);
  }
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
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
    if (path === "/last") return json(res, 200, state);

    if (path === "/vendors") return json(res, 200, { vendors: await rows(ROOT) });

    if (path === "/vendors/check" && req.method === "POST") {
      const vendor = url.searchParams.get("vendor") ?? "";
      try {
        return json(res, 200, { vendor, result: await check(ROOT, vendor) });
      } catch (error) {
        await logFailure(`/vendors/check?vendor=${vendor}`, error);
        return json(res, error instanceof WatchlistError ? 400 : 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (path === "/run" && req.method === "POST") {
      const side = url.searchParams.get("side") === "before" ? "before" : "after";
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson");

      try {
        // Newline-delimited JSON: each phase reaches the column the moment it happens.
        const result = await runSide({
          root: ROOT, side, oldModel: OLD_MODEL, newModel: NEW_MODEL,
          changelog: await changelogCitation(),
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
  console.log(`\n  proof runner on :${PORT}`);
  console.log(`  calling the real api.openai.com — ${OLD_MODEL} was shut down ${SHUTDOWN}\n`);
});
