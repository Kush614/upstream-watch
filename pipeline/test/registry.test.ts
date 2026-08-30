import { describe, it, expect } from "vitest";
import { majorOf, staleness, type PackageVersions } from "../src/clients/registry.ts";

/** A trimmed but real shape: express's actual major boundaries. */
const EXPRESS: PackageVersions = {
  name: "express",
  latest: "5.2.1",
  releases: [
    { version: "4.0.0", published: "2014-04-09T00:00:00.000Z" },
    { version: "4.19.2", published: "2024-03-25T00:00:00.000Z" },
    { version: "5.0.0", published: "2024-09-10T00:00:00.000Z" },
    { version: "5.2.1", published: "2025-12-01T00:00:00.000Z" },
  ],
};

describe("majorOf", () => {
  it("reads a plain version and refuses a prerelease", () => {
    expect(majorOf("5.0.0")).toBe(5);
    // "5.0.0-beta.1" sorting into the majors would date the break to the beta, which is
    // not when it became reachable by an ordinary update.
    expect(majorOf("5.0.0-beta.1")).toBeNull();
    expect(majorOf("3.0.0alpha1")).toBeNull();
  });
});

describe("staleness", () => {
  it("dates the break from the first release of the next major, not from latest", () => {
    const s = staleness(EXPRESS, "4.19.2", new Date("2026-08-30T00:00:00.000Z"));

    expect(s.majorsBehind).toBe(1);
    // 5.0.0, not 5.2.1: the day an `npm update` could first reach the break.
    expect(s.nextMajor?.version).toBe("5.0.0");
    expect(s.daysSincePinned).toBe(888);
  });

  it("reports nothing to worry about when the pin is current", () => {
    expect(staleness(EXPRESS, "5.2.1").majorsBehind).toBe(0);
  });

  it("does not invent a next major for an unparseable pin", () => {
    const s = staleness(EXPRESS, "not-a-version");
    expect(s.nextMajor).toBeNull();
    expect(s.daysSincePinned).toBeNull();
  });
});

describe("what the review caught", () => {
  it("never reports an unparseable pin as up to date", async () => {
    // "^4.19.2", "latest", a git URL — anything majorOf cannot read used to fall through
    // to majorsBehind: 0, which renders as the most reassuring answer available in the
    // one case where we know the least.
    const s = staleness(EXPRESS, "^4.19.2");

    expect(s.unparseablePin).toBe("^4.19.2");
    expect(s.nextMajor).toBeNull();
  });
});
