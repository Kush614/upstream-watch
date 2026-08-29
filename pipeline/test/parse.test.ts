import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { extractEntries, readEmbeddedJson, walkPath } from "../src/lib/parse.ts";
import { loadSpec, parseSpecs } from "../src/lib/spec.ts";
import { validateEntries } from "../src/lib/validate.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";
import { STRIPE_FIXTURE, STRIPE_RESTRUCTURED } from "./helpers.ts";

const SCHEMA = "schemas/changelog-entry.json";

async function fixture(path: string): Promise<string> {
  return readFile(fromRepoRoot(path), "utf8");
}

describe("walkPath", () => {
  const root = { a: { b: [{ c: [1, 2] }, { c: [3] }] } };

  it("fans out over arrays with []", () => {
    expect(walkPath(root, "a.b[].c[]")).toEqual([1, 2, 3]);
  });

  it("indexes with [n]", () => {
    expect(walkPath({ title: ["first", "second"] }, "title[0]")).toEqual(["first"]);
  });

  it("returns nothing for a missing path rather than throwing", () => {
    expect(walkPath(root, "a.nope[].c")).toEqual([]);
  });
});

describe("readEmbeddedJson", () => {
  it("reads a balanced object even when script follows it", () => {
    const html = `<script>window.S = {"a":{"b":1}};\nmore();</script>`;

    expect(readEmbeddedJson(html, "window.S = ")).toEqual({ a: { b: 1 } });
  });

  it("is not fooled by braces inside strings", () => {
    const html = `<script>window.S = {"a":"}{ not real"};</script>`;

    expect(readEmbeddedJson(html, "window.S = ")).toEqual({ a: "}{ not real" });
  });

  it("returns null when the marker is absent", () => {
    expect(readEmbeddedJson("<html></html>", "window.S = ")).toBeNull();
  });
});

describe("embedded-json extraction against the real Stripe capture", () => {
  it("extracts entries that all satisfy the schema", async () => {
    const entries = extractEntries(await fixture(STRIPE_FIXTURE), await loadSpec("stripe"));
    const { valid, invalid } = await validateEntries(entries, SCHEMA);

    expect(entries.length).toBeGreaterThan(30);
    expect(invalid).toHaveLength(0);
    expect(valid.length).toBe(entries.length);
  });

  it("carries the vendor's own breaking flag rather than guessing", async () => {
    const entries = extractEntries(await fixture(STRIPE_FIXTURE), await loadSpec("stripe"));

    // Stripe publishes `breaking` itself. Some entries are true, most are not.
    expect(entries.some((e) => e.breaking)).toBe(true);
    expect(entries.some((e) => !e.breaking)).toBe(true);
  });

  it("builds absolute permalinks from the url template", async () => {
    const entries = extractEntries(await fixture(STRIPE_FIXTURE), await loadSpec("stripe"));

    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/docs\.stripe\.com\/changelog\/[^#]+#.+/);
    }
  });

  it("normalises a release like 2026-08-26.dahlia into an ISO date", async () => {
    const entries = extractEntries(await fixture(STRIPE_FIXTURE), await loadSpec("stripe"));

    for (const entry of entries) expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("folds the vendor's changed/affected symbols into the body so matching can see them", async () => {
    const entries = extractEntries(await fixture(STRIPE_FIXTURE), await loadSpec("stripe"));
    const target = entries.find((e) => e.title.includes("payment method types"));

    expect(target?.body).toContain("PaymentIntent#create");
  });

  it("returns nothing when the vendor restructures the page", async () => {
    // Same entries, renamed marker and re-nested. The committed spec cannot see them.
    const entries = extractEntries(await fixture(STRIPE_RESTRUCTURED), await loadSpec("stripe"));

    expect(entries).toEqual([]);
  });
});

describe("css extraction", () => {
  const spec = parseSpecs(`\`\`\`yaml
vendors:
  acme:
    url: https://acme.test/changelog
    entry_selector: article.entry
    fields:
      date: { attr: data-date }
      title: h3
      body: .body
      url: { selector: a.permalink, attr: href }
    breaking_hint: ["deprecat"]
\`\`\``).get("acme")!;

  const html = `
    <article class="entry" data-date="2026-08-28">
      <h3>The <code>source</code> parameter is deprecated</h3>
      <a class="permalink" href="/changelog/release-1">link</a>
      <div class="body"><p>Use <code>payment_method</code>.</p></div>
    </article>`;

  it("extracts fields by selector and attribute", () => {
    const [entry] = extractEntries(html, spec);

    expect(entry?.date).toBe("2026-08-28");
    expect(entry?.title).toContain("`source`");
  });

  it("resolves a root-relative permalink against the page URL", () => {
    // Left verbatim it fails the schema's uri format, so every entry would be dropped.
    expect(extractEntries(html, spec)[0]?.url).toBe("https://acme.test/changelog/release-1");
  });

  it("preserves code spans as backticked tokens", () => {
    expect(extractEntries(html, spec)[0]?.body).toContain("`payment_method`");
  });
});
