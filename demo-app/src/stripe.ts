/**
 * Minimal Stripe client.
 *
 * This is the seam Upstream Watch is watching: the method names and parameter shapes
 * below are dictated by a third party who can change them without asking us.
 */

const STRIPE_API = process.env.STRIPE_API_BASE ?? "https://api.stripe.com/v1";

type FormValue = string | number | boolean | undefined | { [key: string]: FormValue };

export interface PaymentIntentCreateParams {
  amount: number;
  currency: string;
  description?: string;
  confirm: boolean;
  payment_method_data: {
    type: "card";
    card: { token: string };
  };
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
}

export interface StripeApi {
  paymentIntents: { create(params: PaymentIntentCreateParams): Promise<PaymentIntent> };
}

function appendFormValue(form: URLSearchParams, key: string, value: FormValue): void {
  if (value === undefined) return;

  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }

  form.append(key, String(value));
}

async function post<T>(path: string, params: Record<string, FormValue>, apiKey: string): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) appendFormValue(body, key, value);

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) throw new Error(`Stripe ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function createStripe(apiKey = process.env.STRIPE_API_KEY ?? ""): StripeApi {
  return {
    paymentIntents: {
      create: (params) => post<PaymentIntent>("/payment_intents", { ...params }, apiKey),
    },
  };
}
