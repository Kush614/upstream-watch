import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp, takePayment, validatePayment } from "../src/payments.ts";
import type { ChargeCreateParams, StripeApi } from "../src/stripe.ts";

/** Records what the vendor client was called with. No network in tests. */
function fakeStripe(): StripeApi & { calls: ChargeCreateParams[] } {
  const calls: ChargeCreateParams[] = [];
  return {
    calls,
    charges: {
      async create(params) {
        calls.push(params);
        return { id: "ch_test123", amount: params.amount, currency: params.currency, status: "succeeded" };
      },
    },
  };
}

describe("validatePayment", () => {
  const valid = { amountCents: 2500, currency: "USD", token: "tok_visa" };

  it("accepts a well-formed request", () => {
    expect(validatePayment(valid)).toMatchObject({ amountCents: 2500, token: "tok_visa" });
  });

  it.each([
    ["zero", { ...valid, amountCents: 0 }],
    ["negative", { ...valid, amountCents: -1 }],
    ["fractional", { ...valid, amountCents: 1.5 }],
    ["NaN", { ...valid, amountCents: Number.NaN }],
    ["Infinity", { ...valid, amountCents: Number.POSITIVE_INFINITY }],
    ["a bad currency", { ...valid, currency: "dollars" }],
    ["a missing token", { ...valid, token: "" }],
  ])("rejects %s", (_label, body) => {
    expect(() => validatePayment(body)).toThrow(RangeError);
  });
});

describe("takePayment", () => {
  it("calls the vendor API this service depends on", async () => {
    const stripe = fakeStripe();

    await takePayment(stripe, { amountCents: 2500, currency: "USD", token: "tok_visa" });

    // Pinned deliberately. When Stripe deprecates the Charges API, this assertion is what
    // fails first, and updating it is part of the patch.
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({
      amount: 2500,
      currency: "usd",
      source: "tok_visa",
      description: "upstream-watch demo order",
    });
  });

  it("normalises the currency and keeps the amount in minor units", async () => {
    const stripe = fakeStripe();

    const result = await takePayment(stripe, { amountCents: 999, currency: "GBP", token: "tok_mc" });

    expect(stripe.calls[0]?.currency).toBe("gbp");
    expect(result).toMatchObject({ id: "ch_test123", status: "succeeded", amount: 999 });
  });
});

describe("POST /payments", () => {
  it("creates a payment and returns 201", async () => {
    const stripe = fakeStripe();

    const res = await request(createApp(stripe))
      .post("/payments")
      .send({ amountCents: 4200, currency: "eur", token: "tok_visa" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "ch_test123", status: "succeeded", amount: 4200 });
  });

  it("rejects an invalid amount with 400", async () => {
    const res = await request(createApp(fakeStripe()))
      .post("/payments")
      .send({ amountCents: -5, currency: "eur", token: "tok_visa" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
  });

  it("surfaces a vendor failure as 502 rather than crashing", async () => {
    const stripe: StripeApi = {
      charges: { create: vi.fn().mockRejectedValue(new Error("Stripe /charges failed: 402")) },
    };

    const res = await request(createApp(stripe))
      .post("/payments")
      .send({ amountCents: 100, currency: "usd", token: "tok_chargeDeclined" });

    expect(res.status).toBe(502);
  });

  it("serves a health check", async () => {
    const res = await request(createApp(fakeStripe())).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
