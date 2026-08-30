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

import { versionsOf, staleness, majorOf } from "../pipeline/src/clients/registry.ts";
import { loadPackages, type WatchedPackage } from "../pipeline/src/lib/packages.ts";
import { releases, compare } from "../pipeline/src/clients/source.ts";
import { ConfigError } from "../pipeline/src/errors.ts";

export interface PackageFinding {
  package: string;
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
  files: string[];
}

export async function checkPackage(p: WatchedPackage): Promise<PackageFinding> {
  const versions = await versionsOf(p.package);
  const stale = staleness(versions, p.pinned);

  const finding: PackageFinding = {
    package: p.package,
    repo: p.repo,
    pinned: p.pinned,
    latest: versions.latest,
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
  if (stale.majorsBehind === 0) return finding;

  for (const note of await releases(p.repo, 30)) {
    const major = majorOf(note.tag.replace(/^v/, ""));
    if (major === null || major <= (majorOf(p.pinned) ?? 0)) continue;

    for (const symbol of p.symbols) {
      const line = note.body.split("\n").find((l) => l.includes(symbol));
      if (line) {
        finding.announced.push({ tag: note.tag, url: note.url, quote: line.trim().slice(0, 200) });
        break;
      }
    }
  }

  if (stale.nextMajor) {
    const diff = await compare(p.repo, p.pinned, stale.nextMajor.version, p.symbols, p.package);
    finding.inSource = diff.hits;
    finding.compareUrl = diff.url;
    finding.commits = diff.commits;
    finding.filesChanged = diff.filesChanged;
  }

  return finding;
}

function render(f: PackageFinding): void {
  const behind = f.majorsBehind === 0 ? "up to date" : `${f.majorsBehind} major${f.majorsBehind > 1 ? "s" : ""} behind`;
  console.log(`\n  ${f.package}  ${f.pinned} → ${f.latest}   ${behind}`);
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes("--package") ? args[args.indexOf("--package") + 1] : undefined;
  const asJson = args.includes("--json");

  const packages = (await loadPackages()).filter((p) => !only || p.name === only || p.package === only);
  if (packages.length === 0) throw new ConfigError(`no watched package matches ${only}`, { only });

  const findings = await Promise.all(packages.map(checkPackage));

  if (asJson) console.log(JSON.stringify(findings, null, 2));
  else findings.forEach(render);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
