/**
 * Thin wrapper over the Stripe Charges API.
 *
 * This is the code Upstream Watch is watching: the parameter names below are dictated
 * by a third party who can change them without asking us.
 */

/** Parameters for `POST /v1/charges`. Shape is dictated by the Stripe API. */
export interface StripeChargeParams {
  amount: number;
  currency: string;
  source: string;
  description: string;
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
}

export interface StripeClient {
  createCharge(params: StripeChargeParams): Promise<StripeCharge>;
}

const STRIPE_API = "https://api.stripe.com/v1";

export function createStripeClient(apiKey: string): StripeClient {
  return {
    async createCharge(params: StripeChargeParams): Promise<StripeCharge> {
      const res = await fetch(`${STRIPE_API}/charges`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ),
      });

      if (!res.ok) {
        throw new Error(`Stripe charge failed: ${res.status} ${await res.text()}`);
      }
      return (await res.json()) as StripeCharge;
    },
  };
}
