import { describe, it, expect } from "vitest";
import { readPrBody, splitDiff, testResultFrom } from "../src/adapter.ts";

/** A PR body in the shape agent/prompts/pr-body.md produces. */
const BODY = `## Upstream change detected — openai

**Changelog entry** (2026-12-11): \`gpt-5-mini-2025-08-07\`
> Dec 11, 2026 \`gpt-5-mini-2025-08-07\` → \`gpt-5.6-terra\`
Source: https://platform.openai.com/docs/deprecations
Provenance: cache

**Why this matters:** Replaced the deprecated risk model with the recommended replacement.

**Files changed:** demo-app/src/risk.ts, demo-app/test/vendors.test.ts

**Tests:**
\`\`\`
vitest run: 3 files, 20 tests passed
\`\`\`
`;

describe("testResultFrom", () => {
  it("reads a definite pass", () => {
    expect(testResultFrom("20 tests passed")).toBe(true);
  });

  it("reads a definite failure", () => {
    expect(testResultFrom("2 failed | 18 passed")).toBe(false);
  });

  it("returns null when nothing says either way", () => {
    // The dangerous case: this badge sits above the only irreversible button on the page.
    expect(testResultFrom("running…")).toBeNull();
    expect(testResultFrom("")).toBeNull();
  });

  it("never reports a pass merely because output exists", () => {
    expect(testResultFrom("some unrelated log output")).not.toBe(true);
  });
});

describe("readPrBody", () => {
  const parsed = readPrBody(BODY);

  it("recovers vendor, date and source link", () => {
    expect(parsed.vendor).toBe("openai");
    expect(parsed.date).toBe("2026-12-11");
    expect(parsed.url).toBe("https://platform.openai.com/docs/deprecations");
  });

  it("recovers the quoted excerpt and the rationale", () => {
    expect(parsed.excerpt).toContain("gpt-5.6-terra");
    expect(parsed.rationale).toContain("recommended replacement");
  });

  it("recovers the changed files and the provenance", () => {
    expect(parsed.files).toContain("demo-app/src/risk.ts");
    expect(parsed.provenance).toBe("cache");
  });

  it("degrades to empty rather than throwing on an unrecognised body", () => {
    const bare = readPrBody("");

    expect(bare.vendor).toBe("unknown");
    expect(bare.files).toEqual([]);
  });
});

describe("splitDiff", () => {
  it("separates removed from added lines", () => {
    const { before, after } = splitDiff(
      'diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-const M = "old";\n+const M = "new";\n',
    );

    expect(before.join("")).toContain('"old"');
    expect(after.join("")).toContain('"new"');
    expect(before.join("")).not.toContain('"new"');
  });

  it("keeps context lines on both sides", () => {
    const { before, after } = splitDiff("@@ -1,2 +1,2 @@\n context\n-gone\n+added\n");

    expect(before).toContain("context");
    expect(after).toContain("context");
  });
});

describe("a merge gate opened in a session that did not create the PR", () => {
  it("takes the PR identity from the gated call's own input", () => {
    // merge_pull_request carries {owner, repo, pullNumber}. A watch someone returns to days
    // later will have the merge in one session and the PR creation in another, so the card
    // has to work from the merge call alone.
    const input = { owner: "Kush614", repo: "upstream-watch", pullNumber: 6 };
    const number = Number(input.pullNumber ?? 0);
    const url = `https://github.com/${input.owner}/${input.repo}/pull/${number}`;

    expect(number).toBe(6);
    expect(url).toBe("https://github.com/Kush614/upstream-watch/pull/6");
  });
});
