import type { StripeChargeParams, StripeCharge, StripeClient } from "./stripe-client.ts";

export interface CheckoutRequest {
  amountCents: number;
  currency: string;
  /** Payment token produced by Stripe.js on the client. */
  token: string;
  description?: string;
}

const DEFAULT_DESCRIPTION = "upstream-watch demo order";

/**
 * Build the parameters for a charge.
 *
 * Kept separate from the network call so it can be tested without hitting Stripe,
 * and so a change to the vendor's parameter names is a one-line diff.
 */
export function buildChargeParams(req: CheckoutRequest): StripeChargeParams {
  // Stripe defines `amount` as a positive integer in the smallest currency unit, so
  // 1.5, NaN and Infinity are all invalid. Catching them here turns a remote 400 into a
  // local error with the offending value in it.
  if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
    throw new RangeError(
      `amountCents must be a positive integer of minor units, got ${req.amountCents}`,
    );
  }

  return {
    amount: req.amountCents,
    currency: req.currency.toLowerCase(),
    source: req.token,
    description: req.description ?? DEFAULT_DESCRIPTION,
  };
}

export async function checkout(
  client: StripeClient,
  req: CheckoutRequest,
): Promise<StripeCharge> {
  return client.createCharge(buildChargeParams(req));
}
