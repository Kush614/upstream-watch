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
  if (req.amountCents <= 0) {
    throw new RangeError(`amountCents must be positive, got ${req.amountCents}`);
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
