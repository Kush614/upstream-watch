/**
 * `pnpm pr:body` — render a PR title and description from a change event plus a patch
 * result. Reads JSON on stdin, writes JSON on stdout.
 *
 * This exists so the orchestrator does not compose the PR description freehand: the
 * untrusted vendor text is quoted by code rather than by a model that just read it.
 */

import { buildPr, type PatchResult } from "../lib/pr.ts";
import type { ChangeEvent, Provenance } from "../types.ts";

const VALID_PROVENANCE: Provenance[] = ["live", "cache"];

interface Input {
  event: ChangeEvent;
  patch: PatchResult;
  /**
   * Required, deliberately. Defaulting would let a live run publish a PR that claims
   * cached data — a quiet lie about the one thing the agent must never get wrong.
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

  if (event?.type !== "change") {
    throw new Error(`pr:body expects a change event, got "${String(event?.type)}"`);
  }
  if (!VALID_PROVENANCE.includes(provenance)) {
    throw new Error(
      `pr:body requires "provenance" to be one of ${VALID_PROVENANCE.join(" | ")}. ` +
        `Copy it from the scrape output; it must not be guessed.`,
    );
  }

  console.log(JSON.stringify(await buildPr({ event, patch, provenance }), null, 2));
}

main().catch((error: unknown) => {
  console.error(`pr:body failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
