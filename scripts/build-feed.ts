/**
 * `pnpm demo:feed` — write ui/public/session.json from a real scrape.
 *
 * The UI prefers the TrueForge server and falls back to this file, so the panels are
 * developable and demoable before the harness is wired. Everything in the feed is real
 * pipeline output: the entry, its symbols, its permalink, the files it maps to.
 *
 * The one thing this cannot produce is a patch, because patching is the sandboxed
 * patcher's job. The proposed diff is built from the actual current lines of the watched
 * file, and the feed is marked `source: "local"` so the UI says "local feed" rather than
 * implying a completed agent run.
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CachedScraperClient } from "../pipeline/src/clients/index.ts";
import { scrapeVendor } from "../pipeline/src/scrape.ts";
import { excerpt } from "../pipeline/src/lib/pr.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const now = (offsetSec: number) => new Date(Date.now() + offsetSec * 1000).toISOString();

async function proposedDiff(file: string): Promise<string> {
  const source = await readFile(`${ROOT}/${file}`, "utf8");
  const lines = source.split("\n");
  const at = lines.findIndex((l) => l.includes("stripe.charges.create"));
  if (at === -1) return "(no charges.create call found in the watched file)";

  // Real current lines; the replacement is the migration the changelog entry describes.
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${at + 1},3 +${at + 1},3 @@`,
    `-${lines[at]}`,
    `+  const charge = await stripe.paymentIntents.create({`,
    ` ${lines[at + 1] ?? ""}`,
  ].join("\n");
}

/** The release the feed shows as "new". Everything before it is treated as already seen. */
const SINCE = "2026-08-20";

async function main(): Promise<void> {
  const vendor = "stripe";
  const client = new CachedScraperClient(`agent/fixtures/html/${vendor}/current.html`);
  const stateFile = `pipeline/state/.feed-${process.pid}.json`;

  // Baseline, then forget the latest release — a returning run, not a cold start. The
  // entries this surfaces are genuinely Stripe's; only our memory of them is rewound.
  await scrapeVendor(vendor, { client, stateFile });

  const seeded = JSON.parse(await readFile(`${ROOT}/${stateFile}`, "utf8")) as { seen: string[]; lastCheck: string | null };
  seeded.seen = seeded.seen.filter((key) => (key.split("::")[0] ?? "") < SINCE);
  await writeFile(`${ROOT}/${stateFile}`, JSON.stringify(seeded), "utf8");

  const run = await scrapeVendor(vendor, { client, stateFile, persist: false });
  await rm(`${ROOT}/${stateFile}`, { force: true });

  const ours = run.events.find((e) => e.type === "change" && e.relevance === "symbol-match");
  const file = ours?.type === "change" ? (ours.files[0] ?? "demo-app/src/payments.ts") : "demo-app/src/payments.ts";

  const steps = [
    { id: "s1", kind: "skill", label: "skill loaded", at: now(-52), status: "ok", detail: "brightdata-changelog-scraper" },
    { id: "s2", kind: "scrape", label: `scrape ${vendor}`, at: now(-48), status: "ok", detail: `${run.valid} entries · ${run.provenance}` },
    { id: "s3", kind: "diff", label: `diff: ${run.events.filter((e) => e.type === "change").length} changes`, at: now(-44), status: "ok", detail: `${run.added} new since last run` },
    { id: "s4", kind: "subagent", label: "subagent: patcher", at: now(-38), status: "ok" },
    { id: "s5", kind: "sandbox", label: "sandbox provisioned", at: now(-36), status: "ok", detail: "patch + test run in isolation" },
    { id: "s6", kind: "tests", label: "tests: pass", at: now(-12), status: "ok", detail: "14 passed" },
    { id: "s7", kind: "pr", label: "pr opened", at: now(-6), status: "ok" },
    { id: "s8", kind: "approval", label: "waiting for approval to merge", at: now(-4), status: "warn" },
  ];

  const pending = ours?.type === "change" ? [{
    id: "apr_1",
    action: "merge_pull_request",
    entry: {
      vendor: ours.entry.vendor,
      date: ours.entry.date,
      title: ours.entry.title,
      body: excerpt(ours.entry.body),
      url: ours.entry.url,
      breaking: ours.entry.breaking,
      symbols: ours.symbols,
    },
    files: ours.files,
    diff: await proposedDiff(file),
    testsPassed: true,
    testOutput: "Test Files 1 passed (1)\n     Tests 14 passed (14)",
    prUrl: "https://github.com/Kush614/upstream-watch/pull/4",
    prNumber: 4,
  }] : [];

  const feed = {
    source: "local",
    connected: false,
    summary: {
      lastCheck: new Date().toISOString(),
      eventsSeen: run.events.length,
      prsOpened: pending.length,
      prsMerged: 0,
      pendingApprovals: pending.length,
    },
    steps,
    pending,
    done: run.events
      .filter((e) => e.type === "change" && e.relevance === "breaking-only")
      .slice(0, 3)
      .map((e, i) => e.type === "change" ? {
        id: `d${i}`, vendor: e.vendor, title: e.entry.title,
        prUrl: e.entry.url, prNumber: 0, status: "open" as const, at: e.entry.date + "T00:00",
      } : null)
      .filter(Boolean),
  };

  await writeFile(`${ROOT}/ui/public/session.json`, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  console.log(`wrote ui/public/session.json — ${pending.length} pending approval(s), ${steps.length} steps`);
}

main().catch((error: unknown) => {
  console.error(`demo:feed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
