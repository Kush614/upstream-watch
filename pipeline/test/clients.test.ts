import { describe, it, expect } from "vitest";
import { versionsOf } from "../src/clients/registry.fake.ts";
import { compare, releases } from "../src/clients/source.fake.ts";
import { staleness } from "../src/clients/registry.ts";
import { mentions } from "../src/clients/source.ts";

/** No network: every external client has a fixture-backed fake (CLAUDE.md §7). */

describe("the registry fake", () => {
  it("keeps prereleases out of the major boundaries", async () => {
    const v = await versionsOf("express");
    const s = staleness(v, "4.19.2", new Date("2026-08-30T00:00:00Z"));

    // 5.0.0-beta.1 shipped in 2022. Dating the break from the beta would claim the break
    // was reachable two years before an ordinary `npm install` could have found it.
    expect(s.nextMajor?.version).toBe("5.0.0");
    expect(s.nextMajor?.published.slice(0, 10)).toBe("2024-09-10");
  });

  it("fails on an unknown package rather than returning nothing", async () => {
    await expect(versionsOf("not-a-real-package")).rejects.toThrow(/no fixture/);
  });
});

describe("the source fake", () => {
  it("reports a capped diff as capped", async () => {
    const diff = await compare("expressjs/express", "4.19.2", "5.2.1", ["res.send"]);

    expect(diff.filesChanged).toBe(300);
    // "0 changes to anything you call" from a capped diff is the absence of a finding, not
    // a finding of absence.
    expect(diff.truncated).toBe(true);
  });

  it("does not let res.sendFile answer for res.send", async () => {
    const [etagNote] = await releases();
    expect(etagNote.body).toContain("res.sendFile");
    expect(mentions(etagNote.body, "res.send")).toBe(false);
  });
});
