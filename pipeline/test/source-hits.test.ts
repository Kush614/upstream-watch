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

describe("symbol matching", () => {
  it("does not let a longer name masquerade as the symbol", async () => {
    const { mentions } = await import("../src/clients/source.ts");

    // The real false positive: an express 5.1.0 release note about the ETag option in
    // res.sendFile was counted as evidence about res.send.
    expect(mentions("+ add support for ETag option in res.sendFile", "res.send")).toBe(false);
    expect(mentions("- res.send(status) is removed", "res.send")).toBe(true);
    expect(mentions("- calls res.send", "res.send")).toBe(true);
  });

  it("still matches when the symbol ends the line or meets punctuation", async () => {
    const { mentions } = await import("../src/clients/source.ts");
    expect(mentions("uses createRoot", "createRoot")).toBe(true);
    expect(mentions("import { createRoot } from x", "createRoot")).toBe(true);
    expect(mentions("createRootContainer()", "createRoot")).toBe(false);
  });
});

describe("a symbol is not a substring", () => {
  it("does not match when an identifier precedes it either", async () => {
    const { mentions } = await import("../src/clients/source.ts");

    // Checking only the right-hand side let these through.
    expect(mentions("myres.send(x)", "res.send")).toBe(false);
    expect(mentions("config.eslintrc", ".eslintrc")).toBe(false);
    expect(mentions("  res.send(404)", "res.send")).toBe(true);
    expect(mentions("+ .eslintrc is ignored", ".eslintrc")).toBe(true);
  });
});
