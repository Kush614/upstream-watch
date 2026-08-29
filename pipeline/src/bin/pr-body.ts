/**
 * `pnpm pr:body` — render a PR title and description from a change event plus a patch
 * result. Reads JSON on stdin, writes JSON on stdout.
 *
 * This exists so the agent does not compose the PR description freehand. The body carries
 * the changelog excerpt, the source link, the reasoning, and the test log in a fixed shape
 * (docs/PLAN.md §4 H5) — and the untrusted vendor text is quoted by code rather than by a
 * model that just read it.
 *
 *   echo '{"event":…,"patch":…,"provenance":"fixture"}' | pnpm pr:body
 */

import { buildPr, type PatchResult } from "../lib/pr.ts";
import type { ChangeEvent, Provenance } from "../types.ts";

const VALID_PROVENANCE: Provenance[] = ["live", "cache", "fixture"];

interface Input {
  event: ChangeEvent;
  patch: PatchResult;
  /**
   * Required, deliberately. Defaulting a missing value to "fixture" would let a live run
   * publish a PR that says it used cached data - a quiet lie about provenance, which is
   * the one thing the agent is told never to get wrong.
   */
  provenance: Provenance;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = (await readStdin()).trim();
  if (!raw) throw new Error("no input on stdin");

  const { event, patch, provenance } = JSON.parse(raw) as Input;

  if (event?.kind !== "breaking-change") {
    throw new Error(`pr:body expects a breaking-change event, got "${event?.kind}"`);
  }
  if (!VALID_PROVENANCE.includes(provenance)) {
    throw new Error(
      `pr:body requires "provenance" to be one of ${VALID_PROVENANCE.join(" | ")}. ` +
        `It is copied from the run report and must not be guessed.`,
    );
  }

  console.log(
    JSON.stringify(
      buildPr({
        entry: event.entry,
        matches: event.matches,
        patch,
        provenance,
        targetPaths: event.targetPaths,
      }),
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(`pr:body failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
