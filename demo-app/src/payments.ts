import express, { type Express, type Request, type Response } from "express";
import { createStripe, type PaymentIntent, type StripeApi } from "./stripe.ts";

/**
 * The victim.
 *
 * A small payments service that takes a card token and charges it. Kept deliberately
 * small so the whole file fits on a projector, and deliberately real so that patching it
 * is a genuine change rather than a toy edit.
 *
 * The call it depends on — `paymentIntents.create` — is the watched Stripe API for
 * creating card payments.
 */

export interface PaymentRequest {
  amountCents: number;
  currency: string;
  /** Card token produced by Stripe.js on the client. */
  token: string;
  description?: string;
}

export interface PaymentResult {
  id: string;
  status: PaymentIntent["status"];
  amount: number;
  currency: string;
}

const DEFAULT_DESCRIPTION = "upstream-watch demo order";

export function validatePayment(body: unknown): PaymentRequest {
  const { amountCents, currency, token, description } = (body ?? {}) as Partial<PaymentRequest>;

  // Stripe defines `amount` as a positive integer in the smallest currency unit, so
  // 1.5, NaN and Infinity are all invalid.
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw new RangeError(`amountCents must be a positive integer of minor units, got ${amountCents}`);
  }
  if (typeof currency !== "string" || !/^[a-z]{3}$/i.test(currency)) {
    throw new RangeError(`currency must be a 3-letter ISO code, got ${currency}`);
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new RangeError("token is required");
  }

  return { amountCents, currency, token, description };
}

/** Create and confirm a card PaymentIntent from the supplied Stripe.js card token. */
export async function takePayment(stripe: StripeApi, req: PaymentRequest): Promise<PaymentResult> {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: req.amountCents,
    currency: req.currency.toLowerCase(),
    payment_method_data: {
      type: "card",
      card: { token: req.token },
    },
    confirm: true,
    description: req.description ?? DEFAULT_DESCRIPTION,
  });

  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
  };
}

export function createApp(stripe: StripeApi = createStripe()): Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post("/payments", async (req: Request, res: Response) => {
    let payment: PaymentRequest;
    try {
      payment = validatePayment(req.body);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }

    try {
      res.status(201).json(await takePayment(stripe, payment));
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  return app;
}

if (process.argv[1]?.endsWith("payments.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`demo-app listening on :${port}`));
}
