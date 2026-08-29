import { rm, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fromRepoRoot } from "../src/lib/paths.ts";
import type { VendorState } from "../src/lib/state.ts";

let counter = 0;

/** A state file unique to one test, so tests never share or clobber committed state. */
export function tempStateFile(): string {
  return `pipeline/state/.test-${process.pid}-${counter++}.json`;
}

export async function seedState(file: string, state: Partial<VendorState> & { vendor: string }): Promise<void> {
  const full: VendorState = { lastCheck: "2026-08-01T00:00:00.000Z", seen: [], ...state };
  const path = fromRepoRoot(file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(full, null, 2), "utf8");
}

export async function cleanup(files: string[]): Promise<void> {
  for (const file of files) await rm(fromRepoRoot(file), { force: true });
}

export const STRIPE_FIXTURE = "agent/fixtures/html/stripe/current.html";
export const STRIPE_RESTRUCTURED = "agent/fixtures/html/stripe/restructured.html";
