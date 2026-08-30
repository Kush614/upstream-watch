/**
 * Watch the open-source dependencies, not just the vendors with changelog pages.
 *
 *   pnpm oss:check                  # every package, rendered for a human
 *   pnpm oss:check --json           # the same run as JSON, for the agent
 *   pnpm oss:check --package express
 *
 * Reads all three sources per package and says which of them actually noticed the change.
 * That disagreement is the finding: a break present in the diff but absent from the release
 * notes is precisely the one that reaches production.
 */

import { readFile, writeFile } from "node:fs/promises";
import { versionsOf, staleness, majorOf } from "../pipeline/src/clients/registry.ts";
import { fromRepoRoot } from "../pipeline/src/lib/paths.ts";
import { loadPackages, type WatchedPackage } from "../pipeline/src/lib/packages.ts";
import { releases, compare, mentions } from "../pipeline/src/clients/source.ts";
import { ConfigError } from "../pipeline/src/errors.ts";
import { appendNote } from "../pipeline/src/lib/notes.ts";

export interface PackageFinding {
  package: string;
  /** A finding about this repo, or a demonstration that explicitly is not. */
  role: "dependency" | "reference";
  /** Why a reference is shown, and that it does not apply here. */
  note?: string;
  /** Declared symbols that appear in none of the declared files. */
  unusedSymbols?: string[];
  repo: string;
  pinned: string;
  latest: string;
  majorsBehind: number;
  daysSincePinned: number | null;
  /** When the first major above the pin shipped — the day the break became reachable. */
  breakAvailableSince: string | null;
  severity: "silent" | "loud";
  /** Release notes on the next major that mention something we use. */
  announced: Array<{ tag: string; url: string; quote: string }>;
  /** Source changes that touch something we use. The part nobody announces. */
  inSource: Array<{ file: string; symbol: string; lines: string[]; kind: "code" | "docs" }>;
  compareUrl?: string;
  commits?: number;
  filesChanged?: number;
  /** True when GitHub capped the file list — "nothing found" then means "not fully looked". */
  truncated?: boolean;
  /** Set when the pin could not be parsed; never rendered as "up to date". */
  unparseablePin?: string;
  /** Set when the registry's own latest could not be parsed — not the pin's fault. */
  unparseableLatest?: string;
  files: string[];
}

export async function checkPackage(p: WatchedPackage): Promise<PackageFinding> {
  const versions = await versionsOf(p.package);
  // A reference is compared against the version it names, not against latest: it documents
  // one historical step, and re-pointing it at latest would change what it claims.
  const target = p.role === "reference" ? (p.against ?? versions.latest) : versions.latest;
  const stale = staleness({ ...versions, latest: target }, p.pinned);

  const finding: PackageFinding = {
    package: p.package,
    role: p.role,
    note: p.note,
    unusedSymbols: p.unusedSymbols?.length ? p.unusedSymbols : undefined,
    repo: p.repo,
    pinned: p.pinned,
    latest: target,
    majorsBehind: stale.majorsBehind,
    daysSincePinned: stale.daysSincePinned,
    breakAvailableSince: stale.nextMajor?.published ?? null,
    severity: p.severity,
    announced: [],
    inSource: [],
    files: p.files,
  };

  // Nothing above the pin means nothing to warn about. Say so by returning empty findings
  // rather than by inventing reassurance.
  finding.unparseablePin = stale.unparseablePin;
  finding.unparseableLatest = stale.unparseableLatest;
  if (stale.unparseablePin || stale.unparseableLatest) return finding;
  if (stale.majorsBehind === 0) return finding;

  // Match only on symbols this repo actually uses. A declared-but-absent symbol is still
  // REPORTED (as unusedSymbols) so the config error is visible, but it must not manufacture
  // a finding about code that does not exist.
  const used = p.symbols.filter((s) => !p.unusedSymbols?.includes(s));
  if (used.length === 0) return finding;

  for (const note of await releases(p.repo, 4)) {
    const major = majorOf(note.tag.replace(/^v/, ""));
    if (major === null || major <= (majorOf(p.pinned) ?? 0)) continue;

    for (const symbol of used) {
      const line = note.body.split("\n").find((l) => mentions(l, symbol));
      if (line) {
        finding.announced.push({ tag: note.tag, url: note.url, quote: line.trim().slice(0, 200) });
        break;
      }
    }
  }

  {
    // Deliberately NOT gated on nextMajor. A package that never published an x.0.0 for the
    // major above the pin (or tags releases unusually) would otherwise skip the source
    // comparison altogether and report zero code changes — the reassuring answer, produced
    // by not looking. The comparison is what we came for; the date is a bonus.
    const diff = await compare(p.repo, p.pinned, target, used, p.package);
    finding.inSource = diff.hits;
    finding.compareUrl = diff.url;
    finding.commits = diff.commits;
    finding.filesChanged = diff.filesChanged;
    finding.truncated = diff.truncated;
  }

  return finding;
}

function render(f: PackageFinding): void {
  if (f.unparseablePin || f.unparseableLatest) {
    const which = f.unparseablePin
      ? `your pin "${f.unparseablePin}"`
      : `the registry's latest "${f.unparseableLatest}"`;
    console.log(`\n  ${f.package}  ${f.pinned} → ${f.latest}`);
    console.log(`    ⚠ ${which} is not a plain x.y.z, so nothing here was checked — this is NOT "up to date"`);
    return;
  }

  const behind = f.majorsBehind === 0 ? "up to date" : `${f.majorsBehind} major${f.majorsBehind > 1 ? "s" : ""} behind`;
  const tag = f.role === "reference" ? "  [reference — not this repo]" : "";
  console.log(`\n  ${f.package}  ${f.pinned} → ${f.latest}   ${behind}${tag}`);

  if (f.unusedSymbols?.length) {
    // Watching a symbol nobody calls manufactures a finding about code that does not exist.
    console.log(`    ⚠ declared but not found in the watched files: ${f.unusedSymbols.join(", ")}`);
  }
  if (f.majorsBehind === 0) return;

  if (f.breakAvailableSince) {
    const days = Math.round((Date.now() - new Date(f.breakAvailableSince).getTime()) / 86_400_000);
    console.log(`    reachable by anyone running an update since ${f.breakAvailableSince.slice(0, 10)} (${days} days)`);
  }

  console.log(`    announced in release notes : ${f.announced.length}`);
  for (const a of f.announced.slice(0, 2)) console.log(`      ${a.tag}  ${a.quote.slice(0, 90)}`);

  const code = f.inSource.filter((h) => h.kind === "code");
  console.log(`    changed in the actual code : ${code.length}  (of ${f.filesChanged ?? 0} files, ${f.commits ?? 0} commits)`);
  for (const h of code.slice(0, 3)) console.log(`      ${h.file}  [${h.symbol}]`);
  if (f.truncated) {
    console.log(`      ⚠ GitHub caps the diff at 300 files — anything beyond that was never examined`);
  }
  if (code.length === 0 && f.inSource.length > 0) {
    console.log(`      (${f.inSource.length} mentions, but all of them in prose — docs, not behaviour)`);
  }

  // The disagreement is the whole point of reading the source as well as the notes.
  if (code.length > 0 && f.announced.length === 0) {
    console.log(`    ⚠ the source changes something you use and the release notes do not mention it`);
  }
  if (f.severity === "silent") {
    console.log(`    ⚠ this break does not throw — the old call keeps working and means something else`);
  }
}

/**
 * Where the UI reads these from when nothing is running.
 *
 * Three network reads per package means the explorer cannot check on every page load, and
 * a demo cannot depend on GitHub and npm both answering. Each run is stored, so the tree
 * shows a real earlier answer — with the date it was taken — rather than an empty tree,
 * which would read as "nothing to worry about".
 */
const STORE = "ui/public/packages.json";
/** Enough history to show a trend without the file becoming a database. */
const KEEP = 20;

export interface StoredPackages {
  at: string;
  findings: PackageFinding[];
}

export async function store(findings: PackageFinding[], file = STORE): Promise<void> {
  const path = fromRepoRoot(file);
  let history: StoredPackages[] = [];

  try {
    history = JSON.parse(await readFile(path, "utf8")) as StoredPackages[];
    if (!Array.isArray(history)) history = [];
  } catch (cause) {
    // A missing file is the normal first run. An unreadable one must not be silently
    // replaced — that would delete the only offline answer the UI has.
    if ((cause as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new ConfigError(`${file} exists but could not be read — refusing to overwrite it`, {
        file,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  history.unshift({ at: new Date().toISOString(), findings });
  await writeFile(path, `${JSON.stringify(history.slice(0, KEEP), null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes("--package") ? args[args.indexOf("--package") + 1] : undefined;
  const asJson = args.includes("--json");
  // Same opt-out the vendor scraper has, and for the same reason: looking should never
  // change what the next run sees.
  // Opt-IN, like oss:proof. Looking should never quietly replace the answer the UI shows.
  const persist = args.includes("--save");

  const packages = (await loadPackages()).filter((p) => !only || p.name === only || p.package === only);
  if (packages.length === 0) throw new ConfigError(`no watched package matches ${only}`, { only });

  const findings = await Promise.all(packages.map(checkPackage));

  // Only a full run is stored. Filing a --package run as the whole picture would drop the
  // other packages from the UI's offline view entirely.
  if (persist && !only) await store(findings);

  if (asJson) console.log(JSON.stringify(findings, null, 2));
  else findings.forEach(render);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    // Every top-level failure is written down (CLAUDE.md §2.5) — a watcher that dies
    // quietly is indistinguishable from one that found nothing.
    await appendNote({
      summary: `oss:check failed: ${message.slice(0, 60)}`,
      where: "scripts/oss-check.ts",
      symptom: message,
    }).catch(() => undefined);
    process.exitCode = 1;
  });
}
