import { describe, it, expect } from "vitest";
import { assessRelevance } from "../src/lib/relevance.ts";
import type { WatchTarget } from "../src/types.ts";

const target: WatchTarget = {
  vendor: "stripe",
  name: "Stripe API changelog",
  url: "https://docs.stripe.com/changelog",
  fixtures: { baseline: "", breaking: "", restructured: "" },
  extractionSpec: "pipeline/extraction-specs/stripe.json",
  watches: [{ path: "demo-app/src", symbols: ["source", "/v1/charges", "Charges API"] }],
};

describe("assessRelevance", () => {
  it("matches a symbol inside a code span and says so", () => {
    const result = assessRelevance(
      { title: "The `source` parameter is deprecated", body: "Use `payment_method` instead." },
      target,
    );

    expect(result.relevant).toBe(true);
    expect(result.paths).toEqual(["demo-app/src"]);
    expect(result.matches).toContainEqual({ symbol: "source", how: "code" });
  });

  it("matches a symbol that appears inside a larger code token", () => {
    const result = assessRelevance(
      { title: "Charges update", body: "`POST /v1/charges` now returns a new field." },
      target,
    );

    expect(result.matches).toContainEqual({ symbol: "/v1/charges", how: "code" });
  });

  it("records a weaker match when the symbol only appears in prose", () => {
    const result = assessRelevance(
      { title: "Changes to the Charges API", body: "Nothing is code formatted here." },
      target,
    );

    expect(result.matches).toContainEqual({ symbol: "Charges API", how: "text" });
  });

  it("does not match a symbol inside a longer word", () => {
    const result = assessRelevance(
      { title: "Resource limits raised", body: "The `resource_id` field is unchanged." },
      target,
    );

    expect(result.relevant).toBe(false);
  });

  it("reports irrelevance for a vendor change we do not call", () => {
    const result = assessRelevance(
      { title: "The `legacy_reporting` endpoint is deprecated", body: "Migrate to Reporting." },
      target,
    );

    expect(result.relevant).toBe(false);
    expect(result.paths).toEqual([]);
  });
});
