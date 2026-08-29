import { describe, it, expect } from "vitest";
import { classify } from "../src/lib/classify.ts";

describe("classify", () => {
  it("flags an explicit breaking change", () => {
    const result = classify({
      title: "The `source` parameter is deprecated",
      body: "Breaking change. It will be removed on 2027-03-01.",
    });

    expect(result.breaking).toBe(true);
    expect(result.signals).toContain("deprecated");
    expect(result.signals).toContain("breaking-change");
  });

  it("leaves additive changes alone", () => {
    const result = classify({
      title: "Added `payment_method_options` to PaymentIntents",
      body: "This parameter is optional and additive.",
    });

    expect(result.breaking).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("does not fire on the word 'removed' in unrelated prose", () => {
    expect(classify({ title: "Dashboard tweak", body: "We removed some clutter." }).breaking)
      .toBe(false);
  });

  it("catches a rename", () => {
    expect(classify({ title: "Field renamed to `amount_total`", body: "" }).signals)
      .toContain("renamed");
  });
});
