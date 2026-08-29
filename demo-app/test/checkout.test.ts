import { describe, it, expect } from "vitest";
import { buildChargeParams, checkout } from "../src/checkout.ts";
import type { StripeChargeParams, StripeClient } from "../src/stripe-client.ts";

/** Records what it was called with. No network in tests. */
function fakeClient(): StripeClient & { calls: StripeChargeParams[] } {
  const calls: StripeChargeParams[] = [];
  return {
    calls,
    async createCharge(params) {
      calls.push(params);
      return { id: "ch_test", amount: params.amount, currency: params.currency, status: "succeeded" };
    },
  };
}

describe("buildChargeParams", () => {
  it("passes the payment token in the parameter Stripe expects", () => {
    const params = buildChargeParams({ amountCents: 2500, currency: "USD", token: "tok_visa" });

    // Pinned deliberately: when Stripe renames this parameter, this assertion is what
    // fails, and the patch has to update both the caller and this test.
    expect(params.source).toBe("tok_visa");
  });

  it("normalises the currency and converts the amount", () => {
    const params = buildChargeParams({ amountCents: 2500, currency: "USD", token: "tok_visa" });

    expect(params.amount).toBe(2500);
    expect(params.currency).toBe("usd");
  });

  it("falls back to a default description", () => {
    const params = buildChargeParams({ amountCents: 100, currency: "eur", token: "tok_x" });

    expect(params.description).toBe("upstream-watch demo order");
  });

  it("rejects a non-positive amount", () => {
    expect(() => buildChargeParams({ amountCents: 0, currency: "usd", token: "tok_x" }))
      .toThrow(RangeError);
  });
});

describe("checkout", () => {
  it("sends the built parameters to the client", async () => {
    const client = fakeClient();

    const charge = await checkout(client, { amountCents: 999, currency: "gbp", token: "tok_mc" });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.amount).toBe(999);
    expect(charge.status).toBe("succeeded");
  });
});
