import { describe, it, expect } from "vitest";
import { loadSpec, loadSpecs, parseSpecs, extractYamlBlock } from "../src/lib/spec.ts";
import { ConfigError } from "../src/errors.ts";

/**
 * The extraction spec lives in the skill's YAML block, not a separate config file
 * (specs/scraper-pipeline.md §1) — so the spec the agent reads and the spec the pipeline
 * executes are the same bytes. These tests pin that.
 */
describe("extraction spec in SKILL.md", () => {
  it("loads the committed Stripe spec", async () => {
    const spec = await loadSpec("stripe");

    expect(spec.url).toBe("https://docs.stripe.com/changelog");
    expect(spec.strategy).toBe("embedded-json");
    expect(spec.breaking_hint).toContain("deprecat");
    expect(spec.json?.marker).toBe("window.__INITIAL_STATE__ = ");
  });

  it("exposes every vendor in the skill", async () => {
    expect([...(await loadSpecs()).keys()]).toContain("stripe");
  });

  it("takes the last yaml block, so prose examples above it do not win", () => {
    const md = "```yaml\nvendors:\n  a: {url: http://a}\n```\ntext\n```yaml\nvendors:\n  b: {url: http://b}\n```";

    expect(extractYamlBlock(md)).toContain("b:");
  });

  it("defaults to the css strategy", () => {
    const specs = parseSpecs("```yaml\nvendors:\n  acme:\n    url: https://acme.test/log\n    entry_selector: article\n```");

    expect(specs.get("acme")?.strategy).toBe("css");
  });

  it.each([
    ["css with no entry_selector", "vendors:\n  acme:\n    url: https://acme.test/log"],
    ["embedded-json with no json block", "vendors:\n  acme:\n    url: https://acme.test/log\n    strategy: embedded-json"],
    ["an unknown strategy", "vendors:\n  acme:\n    url: https://acme.test/log\n    strategy: telepathy"],
    ["no url", "vendors:\n  acme:\n    entry_selector: article"],
  ])("rejects %s", (_label, yaml) => {
    expect(() => parseSpecs(`\`\`\`yaml\n${yaml}\n\`\`\``)).toThrow(ConfigError);
  });

  it("rejects a skill with no yaml block at all", () => {
    expect(() => parseSpecs("# just prose")).toThrow(ConfigError);
  });
});
