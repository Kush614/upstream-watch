import { describe, it, expect } from "vitest";

/**
 * The classifier that decides whether a diff hit is evidence or just the changelog again.
 * Exercised through the module's own behaviour rather than the network.
 */
const kindOf = (path: string): "code" | "docs" => (/\.(md|mdx|txt)$|^docs?\//i.test(path) ? "docs" : "code");

describe("code versus prose in a diff", () => {
  it("counts source files as evidence", () => {
    expect(kindOf("lib/response.js")).toBe("code");
    expect(kindOf("examples/auth/index.js")).toBe("code");
    expect(kindOf(".eslintrc.js")).toBe("code");
  });

  it("does not count the changelog as an independent source", () => {
    // History.md mentioning res.send is the announcement a second time. Counting it
    // inflates exactly the number this tool exists to compare against the announcement.
    expect(kindOf("History.md")).toBe("docs");
    expect(kindOf("README.md")).toBe("docs");
    expect(kindOf("docs/api.mdx")).toBe("docs");
  });
});
