/**
 * The vendor's own page, as we actually captured it.
 *
 * Every scrape writes raw HTML before parsing (CLAUDE.md §6), which means the cache is a
 * record of what the page looked like each time we read it. That is the honest material for
 * a before/after: not a screenshot someone took, but the bytes the parser was handed.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { UpstreamWatchError } from "../../pipeline/src/errors.ts";

export class CaptureError extends UpstreamWatchError {}

export interface CaptureInfo {
  file: string;
  at: string;
  bytes: number;
}

export interface Captures {
  vendor: string;
  before?: CaptureInfo;
  after?: CaptureInfo;
  /**
   * False when the two captures are byte-identical.
   *
   * The UI must not render a before/after of a page that did not change — a divider over
   * two copies of the same thing implies a restructure nobody made.
   */
  differ: boolean;
}

const dirFor = (root: string, vendor: string) => join(root, "agent/fixtures/html", vendor);

/** Reject anything that could climb out of the capture directory. */
function safe(name: string): string {
  const clean = basename(name);
  if (clean !== name || !/^[\w.\-:]+\.html$/.test(clean)) {
    throw new CaptureError(`not a capture filename: ${name}`, { name });
  }
  return clean;
}

export async function captures(root: string, vendor: string): Promise<Captures> {
  if (!/^[a-z0-9-]+$/.test(vendor)) throw new CaptureError(`not a vendor name: ${vendor}`, { vendor });

  let names: string[];
  try {
    names = (await readdir(dirFor(root, vendor))).filter((n) => n.endsWith(".html"));
  } catch {
    throw new CaptureError(`no captures for ${vendor}`, { vendor });
  }

  // Timestamped captures sort chronologically; current/last-good are aliases of them.
  const dated = names.filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n)).sort();
  const pick = dated.length >= 2 ? [dated.at(-2) as string, dated.at(-1) as string] : dated;

  const info = await Promise.all(
    pick.map(async (file) => {
      const s = await stat(join(dirFor(root, vendor), file));
      return { file, at: s.mtime.toISOString(), bytes: s.size };
    }),
  );

  const [before, after] = info;
  let differ = false;
  if (before && after) {
    const [a, b] = await Promise.all([
      readFile(join(dirFor(root, vendor), before.file), "utf8"),
      readFile(join(dirFor(root, vendor), after.file), "utf8"),
    ]);
    differ = a !== b;
  }

  return { vendor, before, after, differ };
}

export async function captureHtml(root: string, vendor: string, file: string): Promise<string> {
  if (!/^[a-z0-9-]+$/.test(vendor)) throw new CaptureError(`not a vendor name: ${vendor}`, { vendor });
  return readFile(join(dirFor(root, vendor), safe(file)), "utf8");
}
