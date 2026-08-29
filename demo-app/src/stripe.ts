/**
 * Minimal Stripe client.
 *
 * This is the seam Upstream Watch is watching: the method names and parameter shapes
 * below are dictated by a third party who can change them without asking us.
 */

const STRIPE_API = process.env.STRIPE_API_BASE ?? "https://api.stripe.com/v1";

export interface ChargeCreateParams {
  amount: number;
  currency: string;
  source: string;
  description?: string;
}

export interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
}

export interface StripeApi {
  charges: { create(params: ChargeCreateParams): Promise<Charge> };
}

async function post<T>(path: string, params: Record<string, unknown>, apiKey: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    ),
  });

  if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function createStripe(apiKey = process.env.STRIPE_API_KEY ?? ""): StripeApi {
  return {
    charges: {
      create: (params) => post<Charge>("/charges", { ...params }, apiKey),
    },
  };
}
