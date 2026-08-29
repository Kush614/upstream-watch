import { describe, it, expect, afterAll } from "vitest";
import { FixtureScraperClient } from "../src/clients/index.ts";
import { run } from "../src/run.ts";
import { cleanup, emptyButNotFirstRun, seedState, tempStateFile } from "./helpers.ts";

/**
 * The acceptance tests for the pipeline (specs/scraper-pipeline.md §6).
 * No network: everything runs off committed fixtures (CLAUDE.md §7).
 */

const stateFiles: string[] = [];
function freshState(): string {
  const file = tempStateFile();
  stateFiles.push(file);
  return file;
}

afterAll(() => cleanup(stateFiles));

describe("run", () => {
  it("baselines silently on a first run instead of reporting the backlog", async () => {
    const stateFile = freshState();

    const report = await run({ client: new FixtureScraperClient("baseline"), stateFile });

    expect(report.vendors[0]?.firstRun).toBe(true);
    expect(report.vendors[0]?.entriesFound).toBe(4);
    expect(report.events).toHaveLength(0);
  });

  it("produces no events when nothing has changed since the last run", async () => {
    const stateFile = freshState();

    await run({ client: new FixtureScraperClient("baseline"), stateFile });
    const second = await run({ client: new FixtureScraperClient("baseline"), stateFile });

    expect(second.vendors[0]?.added).toBe(0);
    expect(second.events).toHaveLength(0);
  });

  it("emits exactly one event for the seeded breaking change", async () => {
    const stateFile = freshState();

    await run({ client: new FixtureScraperClient("baseline"), stateFile });
    const report = await run({ client: new FixtureScraperClient("breaking"), stateFile });

    expect(report.events).toHaveLength(1);
    const event = report.events[0];

    expect(event?.kind).toBe("breaking-change");
    if (event?.kind !== "breaking-change") throw new Error("unreachable");

    expect(event.entry.date).toBe("2026-08-28");
    expect(event.entry.breaking).toBe(true);
    expect(event.entry.url).toContain("charges-source-deprecated");
    expect(event.targetPaths).toEqual(["demo-app/src"]);
    expect(event.matches.map((m) => m.symbol)).toContain("source");
  });

  it("records a breaking change that touches nothing we call, without acting on it", async () => {
    const stateFile = freshState();
    await seedState(stateFile, emptyButNotFirstRun("stripe"));

    const report = await run({ client: new FixtureScraperClient("baseline"), stateFile });

    // legacy_reporting is deprecated, but demo-app never calls it.
    expect(report.events).toHaveLength(0);
    expect(report.vendors[0]?.ignoredBreaking.map((e) => e.title)).toEqual([
      "The `legacy_reporting` endpoint is deprecated",
    ]);
  });

  it("treats a restructured page as a change event and proposes a repair", async () => {
    const stateFile = freshState();

    const report = await run({ client: new FixtureScraperClient("restructured"), stateFile });

    expect(report.events).toHaveLength(1);
    const event = report.events[0];

    expect(event?.kind).toBe("extraction-broken");
    if (event?.kind !== "extraction-broken") throw new Error("unreachable");

    expect(event.reason).toMatch(/matched no elements/);
    expect(event.cachedHtmlPath).toContain("agent/fixtures/html/");

    // The repair has to actually work, not just be attempted.
    expect(event.repairedSpec?.entry).toBe("section.release-note");
  });

  it("caches the raw HTML before parsing it", async () => {
    const stateFile = freshState();

    const report = await run({ client: new FixtureScraperClient("baseline"), stateFile });

    expect(report.vendors[0]?.cachedHtmlPath).toMatch(
      /^agent\/fixtures\/html\/stripe-scrape-.*\.html$/,
    );
  });
});
