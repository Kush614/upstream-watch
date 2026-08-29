/**
 * Fraud-risk summary for a payment, via the OpenAI API.
 *
 * The model id below is the third vendor dependency this service carries — and the one
 * most likely to be retired out from under it, because model shutdowns are announced on a
 * schedule and nobody reads the deprecations page.
 */

const OPENAI_API = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

/** Pinned deliberately. OpenAI's deprecations page lists a shutdown date for this. */
export const RISK_MODEL = "gpt-5-mini-2025-08-07";

export interface RiskRequest {
  amountCents: number;
  currency: string;
  country: string;
  cardLast4: string;
}

export interface RiskAssessment {
  level: "low" | "medium" | "high";
  reason: string;
}

export interface OpenAIApi {
  summariseRisk(req: RiskRequest): Promise<RiskAssessment>;
}

export function buildRiskPrompt(req: RiskRequest): string {
  return [
    `Assess fraud risk for a card payment.`,
    `Amount: ${(req.amountCents / 100).toFixed(2)} ${req.currency.toUpperCase()}`,
    `Country: ${req.country}`,
    `Card ending: ${req.cardLast4}`,
    `Answer with a level (low, medium or high) and one sentence of reasoning.`,
  ].join("\n");
}

export function createOpenAI(apiKey = process.env.OPENAI_API_KEY ?? ""): OpenAIApi {
  return {
    async summariseRisk(req: RiskRequest): Promise<RiskAssessment> {
      const res = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: RISK_MODEL,
          messages: [{ role: "user", content: buildRiskPrompt(req) }],
        }),
      });

      if (!res.ok) throw new Error(`OpenAI risk check failed: ${res.status}`);

      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content ?? "";
      const level = /\b(high|medium|low)\b/i.exec(text)?.[1]?.toLowerCase() ?? "medium";

      return { level: level as RiskAssessment["level"], reason: text.trim() };
    },
  };
}
