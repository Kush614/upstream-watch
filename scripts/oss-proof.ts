/**
 * Prove each dependency break by running it, on both sides.
 *
 *   pnpm oss:proof                  # every package
 *   pnpm oss:proof --package express
 *
 * This is the part a hosted API cannot offer. To show what OpenAI does on a retired model
 * you must call OpenAI — a key, a rate limit, and a network at demo time. A dependency
 * ships both versions to anyone: install each major, run the same probe against each, and
 * report what actually came back.
 *
 * The probes live in agent/probes/ as ordinary readable files, because a proof whose method
 * you cannot inspect is just an assertion in a nicer font.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadPackages, type WatchedPackage } from "../pipeline/src/lib/packages.ts";
import { fromRepoRoot } from "../pipeline/src/lib/paths.ts";
import { UpstreamWatchError } from "../pipeline/src/errors.ts";
import { appendNote } from "../pipeline/src/lib/notes.ts";

const run = promisify(execFile);

/** Raised when a side could not be run at all — never reported as a passing side. */
export class ProbeError extends UpstreamWatchError {}

export interface Side {
  version: string;
  observed: string;
  detail: string;
  /** Whether the code behaved the way it was written to. */
  healthy: boolean;
  /**
   * True when this side could not be RUN, as distinct from having run and failed.
   *
   * An install that 404s and a version that removed your function both end with a probe
   * that produced nothing. Calling both "unhealthy" turns a broken network into a reported
   * breaking change — a finding about the vendor invented by our own infrastructure.
   */
  couldNotRun?: boolean;
}

export interface OssProof {
  package: string;
  repo: string;
  /** The symbol whose meaning changed. */
  symbol: string;
  severity: "silent" | "loud";
  before: Side;
  after: Side;
  probe: string;
  at: string;
}

/** Install one version in a scratch directory and run the probe against it. */
async function side(pkg: WatchedPackage, version: string, probeSource: string): Promise<Side> {
  const dir = await mkdtemp(join(tmpdir(), `uw-oss-${pkg.package}-`));

  try {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "probe", version: "1.0.0", private: true }));
    await writeFile(join(dir, "probe.cjs"), probeSource);

    try {
      await run("npm", ["install", "--silent", "--no-audit", "--no-fund", ...installArgs(pkg, version)], {
        cwd: dir,
        maxBuffer: 40 * 1024 * 1024,
      });
    } catch (error) {
      const e = error as { stderr?: string };
      return {
        version,
        observed: "could not install this version",
        detail: (e.stderr ?? "").trim().split("\n").slice(0, 2).join(" ").slice(0, 200) || "npm install failed",
        healthy: false,
        couldNotRun: true,
      };
    }

    let stdout = "";
    try {
      ({ stdout } = await run("node", ["probe.cjs"], { cwd: dir, maxBuffer: 20 * 1024 * 1024 }));
    } catch (error) {
      // A probe that crashes is a real observation about this version, not a broken run —
      // but only if it still told us something. An empty crash is handled below.
      const e = error as { stdout?: string; stderr?: string };
      stdout = e.stdout ?? "";
      if (!stdout.trim()) {
        const why = (e.stderr ?? "").trim().split("\n").slice(0, 2).join(" ").slice(0, 200);
        return {
          version,
          observed: "the probe could not run",
          detail: why || "no output",
          healthy: false,
          couldNotRun: true,
        };
      }
    }

    const line = stdout.trim().split("\n").at(-1) ?? "";
    let parsed: { observed?: string; detail?: string; healthy?: boolean };
    try {
      parsed = JSON.parse(line) as typeof parsed;
    } catch {
      throw new ProbeError(`probe for ${pkg.package}@${version} printed something unreadable`, {
        package: pkg.package,
        version,
        line: line.slice(0, 200),
      });
    }

    if (typeof parsed.healthy !== "boolean") {
      // Defaulting this would decide the headline claim of the column by omission.
      throw new ProbeError(`probe for ${pkg.package}@${version} did not say whether it was healthy`, {
        package: pkg.package,
        version,
      });
    }

    return {
      version,
      observed: parsed.observed ?? "(nothing reported)",
      detail: parsed.detail ?? "",
      healthy: parsed.healthy,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** react-dom needs react beside it; eslint needs nothing extra. */
function installArgs(pkg: WatchedPackage, version: string): string[] {
  if (pkg.package === "react-dom") return [`react-dom@${version}`, `react@${version}`];
  return [`${pkg.package}@${version}`];
}

/**
 * Whether a probe says anything about THIS package's watch.
 *
 * `agent/probes/express.cjs` exercises `res.send`. Running it for the express *dependency*
 * — which is watched for `express.json` and `app.get`, and is on a current version — would
 * produce a "breaks" result about a call that watch does not cover. A reference declares the
 * symbol it demonstrates, so it always matches itself.
 */
export function probeApplies(pkg: WatchedPackage, probeSymbol: string): boolean {
  if (pkg.role === "reference") return true;

  const watched = pkg.symbols.filter((s) => !pkg.unusedSymbols?.includes(s));
  return watched.includes(probeSymbol);
}

export async function proveOne(pkg: WatchedPackage, latest: string): Promise<OssProof> {
  const probePath = fromRepoRoot(`agent/probes/${pkg.package}.cjs`);
  let probeSource: string;
  try {
    probeSource = await readFile(probePath, "utf8");
  } catch {
    throw new ProbeError(`no probe at agent/probes/${pkg.package}.cjs — cannot prove this one`, { package: pkg.package });
  }

  // Both sides run the SAME probe. Running different code against each version would prove
  // only that two different programs behave differently.
  const [before, after] = await Promise.all([
    side(pkg, pkg.pinned, probeSource),
    side(pkg, latest, probeSource),
  ]);

  return {
    package: pkg.package,
    repo: pkg.repo,
    // The symbol the PROBE exercises, not the first one this package happens to watch.
    symbol: PROBE_SYMBOL[pkg.package] ?? pkg.symbols[0] ?? pkg.package,
    severity: pkg.severity,
    before,
    after,
    probe: probeSource,
    at: new Date().toISOString(),
  };
}

/** Where the UI reads these when nothing is running. Same contract as packages.json. */
const STORE = "ui/public/oss-proofs.json";

/**
 * What each probe actually exercises.
 *
 * Declared here rather than parsed out of the probe, because the mapping is a claim about
 * what the proof MEANS, and it should be reviewable in one place next to the check that
 * uses it.
 */
const PROBE_SYMBOL: Record<string, string> = {
  express: "res.send",
  "react-dom": "ReactDOM.render",
  eslint: ".eslintrc",
};

export async function storeProofs(proofs: OssProof[], file = STORE): Promise<void> {
  await writeFile(fromRepoRoot(file), `${JSON.stringify(proofs, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes("--package") ? args[args.indexOf("--package") + 1] : undefined;
  // Writing is opt-IN. `pnpm oss:proof` installs packages and takes minutes; having it also
  // overwrite the file the UI reads, by default, means an interrupted or partial run can
  // replace a good stored answer with a worse one.
  const persist = args.includes("--save");

  const packages = (await loadPackages()).filter((p) => !only || p.name === only || p.package === only);
  if (packages.length === 0) throw new ProbeError(`no watched package matches ${only}`, { only });

  // The version to prove against is the one the registry says is current, read from the
  // stored check rather than fetched again — the two must agree or the columns are about
  // different things.
  const stored = JSON.parse(await readFile(fromRepoRoot("ui/public/packages.json"), "utf8")) as Array<{
    findings: Array<{ package: string; latest: string }>;
  }>;
  // Keyed by the WATCH, not the package. express appears twice — a current dependency and
  // a 4-to-5 reference — and one key for both hands the reference the dependency's target.
  const latestOf = new Map(stored[0]?.findings.map((f) => [`${f.role}:${f.package}`, f.latest]) ?? []);

  const proofs: OssProof[] = [];
  for (const p of packages) {
    const latest = p.against ?? latestOf.get(`${p.role}:${p.package}`);
    if (!latest) throw new ProbeError(`no stored check for ${p.package} — run pnpm oss:check first`, { package: p.package });

    // The probe exercises one symbol. If this package is not watched for that symbol, the
    // result says nothing about it, and attaching one anyway is a claim about a call the
    // repo does not make.
    if (!probeApplies(p, PROBE_SYMBOL[p.package] ?? "")) {
      console.log(`  ${p.package} ${p.pinned} — no probe covers what this watch is for; skipped`);
      continue;
    }

    process.stdout.write(`  ${p.package} ${p.pinned} vs ${latest} … `);
    const proof = await proveOne(p, latest);
    proofs.push(proof);

    // A side that could not run proves nothing in either direction. Reporting it as BROKE
    // would credit our own npm failure to the vendor.
    const unrunnable = proof.before.couldNotRun || proof.after.couldNotRun;
    const arrow = unrunnable
      ? "INCONCLUSIVE"
      : proof.before.healthy && !proof.after.healthy
        ? "BROKE"
        : proof.after.healthy
          ? "fine"
          : "check";
    console.log(`${arrow}\n    before  ${proof.before.observed}\n    after   ${proof.after.observed}`);
  }

  if (persist && !only) {
    await storeProofs(proofs);
    console.log(`\n  saved to ui/public/oss-proofs.json`);
  } else if (!only) {
    console.log(`\n  not saved — pass --save to update ui/public/oss-proofs.json`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    // CLAUDE.md §2.5: a prover that dies quietly is indistinguishable from one that proved
    // nothing was wrong.
    await appendNote({
      summary: `oss:proof failed: ${message.slice(0, 60)}`,
      where: "scripts/oss-proof.ts",
      symptom: message,
    }).catch(() => undefined);
    process.exitCode = 1;
  });
}
