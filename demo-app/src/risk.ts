/**
 * Fraud-risk summary for a payment, via the OpenAI API.
 *
 * The model id below is the third vendor dependency this service carries — and the one
 * most likely to be retired out from under it, because model shutdowns are announced on a
 * schedule and nobody reads the deprecations page.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OPENAI_API = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

/** Prompts are .md files under agent/prompts/, never inline strings (CLAUDE.md §7). */
const PROMPT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../agent/prompts/risk-summary.md");

/**
 * The body after the `---` separator; everything above it is guidance for humans.
 *
 * A missing or empty prompt file is a real failure path — the file is data, and data goes
 * missing. Left to `readFileSync` it surfaces as a bare ENOENT from inside a payment
 * request, which is a confusing place to learn that a Markdown file was not deployed. It
 * fails here instead, saying which file and why. See NOTES.md 2026-08-30.
 */
function promptTemplate(): string {
  let raw: string;
  try {
    raw = readFileSync(PROMPT_FILE, "utf8");
  } catch (cause) {
    throw new Error(
      `Risk prompt not found at ${PROMPT_FILE}. Prompts live in .md files under ` +
        `agent/prompts/ (CLAUDE.md §7) and must ship with the app. (${String(cause)})`,
    );
  }

  const body = (raw.split(/^---$/m)[1] ?? raw).trim();
  if (!body) throw new Error(`Risk prompt at ${PROMPT_FILE} has no body below the --- separator.`);

  return body;
}

/** Pinned deliberately. OpenAI's deprecations page lists a shutdown date for this. */
export const RISK_MODEL = "gpt-5.6-terra";

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
  const values: Record<string, string> = {
    amount: (req.amountCents / 100).toFixed(2),
    currency: req.currency.toUpperCase(),
    country: req.country,
    cardLast4: req.cardLast4,
  };

  return promptTemplate().replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
};

function responseText(body: OpenAIResponseBody): string {
  return (
    body.output_text
    ?? body.output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("")
    ?? ""
  );
}

export function createOpenAI(apiKey = process.env.OPENAI_API_KEY ?? ""): OpenAIApi {
  return {
    async summariseRisk(req: RiskRequest): Promise<RiskAssessment> {
      const res = await fetch(`${OPENAI_API}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: RISK_MODEL,
          input: buildRiskPrompt(req),
          // The Responses API stores requests by default. This one carries an amount, a
          // country and the card's last four digits — payment metadata that the previous
          // Chat Completions call never persisted. Opt out explicitly rather than changing
          // a deployment's retention behaviour as a side effect of an API migration.
          store: false,
        }),
      });

      if (!res.ok) throw new Error(`OpenAI risk check failed: ${res.status}`);

      const text = responseText((await res.json()) as OpenAIResponseBody);
      const level = /\b(high|medium|low)\b/i.exec(text)?.[1]?.toLowerCase() ?? "medium";

      return { level: level as RiskAssessment["level"], reason: text.trim() };
    },
  };
}
