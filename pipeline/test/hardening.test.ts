import { describe, it, expect, afterAll } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { extractEntries } from "../src/lib/parse.ts";
import { loadExtractionSpec } from "../src/lib/extraction-spec.ts";
import { loadState } from "../src/lib/state.ts";
import { loadTargets } from "../src/lib/targets.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";
import { ConfigError } from "../src/errors.ts";
import { run } from "../src/run.ts";
import { cleanup, tempStateFile } from "./helpers.ts";
import type { ScraperClient } from "../src/clients/index.ts";
import type { ExtractionSpec, ScrapeResult, WatchTarget } from "../src/types.ts";

/**
 * Regression tests for the Qodo review on PRs #1-#3. Each one pins a failure mode that
 * used to be silent.
 */

const scratch: string[] = [];
async function tempFile(name: string, contents: string): Promise<string> {
  const relative = `.upstream-watch/${name}`;
  const absolute = fromRepoRoot(relative);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
  scratch.push(relative);
  return relative;
}

afterAll(() => cleanup(scratch));

describe("relative permalinks", () => {
  it("resolves a root-relative href against the page it was found on", async () => {
    const spec = await loadExtractionSpec("pipeline/extraction-specs/stripe.json");
    const html = `
      <article class="changelog-entry" data-date="2026-08-28">
        <h3 class="changelog-title">Something changed</h3>
        <a class="changelog-permalink" href="/changelog/release-1">Permalink</a>
        <div class="changelog-body"><p>Body.</p></div>
      </article>`;

    const [entry] = extractEntries(html, spec, "https://docs.stripe.com/changelog");

    // Left verbatim, "/changelog/release-1" fails the schema's uri format and the entry
    // is dropped — extraction looks broken while working perfectly.
    expect(entry?.url).toBe("https://docs.stripe.com/changelog/release-1");
  });
});

describe("extraction spec validation", () => {
  it.each(["body", "url", "date", "title"])(
    "rejects a spec with no %s field rather than crashing during extraction",
    async (field) => {
      const spec = await loadExtractionSpec("pipeline/extraction-specs/stripe.json");
      const broken = structuredClone(spec) as unknown as {
        fields: Record<string, unknown>;
      };
      delete broken.fields[field];

      const file = await tempFile(`spec-${field}.json`, JSON.stringify(broken));

      await expect(loadExtractionSpec(file)).rejects.toThrow(ConfigError);
    },
  );
});

describe("state file", () => {
  it("treats a missing file as a cold start", async () => {
    await expect(loadState(".upstream-watch/definitely-absent.json")).resolves.toEqual({});
  });

  it("refuses to treat a corrupt file as a cold start", async () => {
    const file = await tempFile("corrupt-state.json", "{ this is not json");

    // Silently returning {} here would baseline the whole page and suppress every change
    // since the last good run.
    await expect(loadState(file)).rejects.toThrow(ConfigError);
  });
});

describe("targets validation", () => {
  it("rejects a watch with no symbols", async () => {
    const file = await tempFile(
      "targets-no-symbols.yaml",
      [
        "version: 1",
        "targets:",
        "  - vendor: stripe",
        "    name: Stripe",
        "    url: https://docs.stripe.com/changelog",
        "    fixtures: { baseline: a, breaking: b, restructured: c }",
        "    extraction_spec: pipeline/extraction-specs/stripe.json",
        "    watches:",
        "      - path: demo-app/src",
        "        symbols: []",
      ].join("\n"),
    );

    // Such a config loads fine and then makes every breaking change look irrelevant.
    await expect(loadTargets(file)).rejects.toThrow(ConfigError);
  });
});

describe("partial validation failures", () => {
  /** Two entries; the second has no date, so it cannot validate. */
  const html = `
    <div class="changelog-list">
      <article class="changelog-entry" data-date="2026-08-28">
        <h3 class="changelog-title">A readable entry</h3>
        <a class="changelog-permalink" href="https://docs.stripe.com/changelog/ok">Permalink</a>
        <div class="changelog-body"><p>Fine.</p></div>
      </article>
      <article class="changelog-entry">
        <h3 class="changelog-title">The <code>source</code> parameter is deprecated</h3>
        <a class="changelog-permalink" href="https://docs.stripe.com/changelog/bad">Permalink</a>
        <div class="changelog-body"><p>Breaking change. It will be removed.</p></div>
      </article>
    </div>`;

  const client: ScraperClient = {
    async scrape(target: WatchTarget): Promise<ScrapeResult> {
      return {
        vendor: target.vendor,
        html,
        provenance: "fixture",
        cachedHtmlPath: "agent/fixtures/html/test.html",
      };
    },
  };

  it("surfaces entries that failed validation instead of dropping them", async () => {
    const stateFile = tempStateFile();
    scratch.push(stateFile);

    const report = await run({ client, stateFile });

    // The malformed entry is the breaking one. Continuing quietly on the valid entry
    // would leave it permanently undetected.
    const degraded = report.events.find((e) => e.kind === "extraction-broken");

    expect(degraded).toBeDefined();
    if (degraded?.kind !== "extraction-broken") throw new Error("unreachable");

    expect(degraded.partial).toBe(true);
    expect(degraded.reason).toMatch(/1 of 2 entries failed schema validation/);
  });
});

describe("untrusted vendor text in a spec", () => {
  it("does not let a spec smuggle a non-object field", async () => {
    const spec = await loadExtractionSpec("pipeline/extraction-specs/stripe.json");
    const broken = { ...spec, fields: { ...spec.fields, url: "href" } } as unknown as ExtractionSpec;
    const file = await tempFile("spec-string-field.json", JSON.stringify(broken));

    await expect(loadExtractionSpec(file)).rejects.toThrow(ConfigError);
  });
});
