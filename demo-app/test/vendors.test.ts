import { describe, it, expect, vi } from "vitest";
import { RISK_MODEL, buildRiskPrompt } from "../src/risk.ts";
import { formatPaymentMessage, notifyPayment, type SlackApi } from "../src/notify.ts";

describe("OpenAI risk check", () => {
  it("uses the model this service is pinned to", () => {
    // Pinned deliberately: OpenAI publishes a shutdown date for this model, so when the
    // deprecation lands this assertion is what has to change alongside the call.
    expect(RISK_MODEL).toBe("gpt-5.6-terra");
  });

  it("builds a prompt carrying the facts a reviewer needs", () => {
    const prompt = buildRiskPrompt({ amountCents: 4200, currency: "usd", country: "GB", cardLast4: "4242" });

    expect(prompt).toContain("42.00 USD");
    expect(prompt).toContain("Country: GB");
    expect(prompt).toContain("4242");
  });
});

describe("Slack notification", () => {
  it("formats the payment message", () => {
    expect(formatPaymentMessage({ channel: "#ops", chargeId: "pi_1", amountCents: 2500, currency: "gbp" }))
      .toBe("Payment pi_1 succeeded: 25.00 GBP");
  });

  it("posts through chat.postMessage", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ok: true, ts: "1.0" });
    const slack: SlackApi = { postMessage };

    await notifyPayment(slack, { channel: "#ops", chargeId: "pi_2", amountCents: 100, currency: "eur" });

    expect(postMessage).toHaveBeenCalledWith({ channel: "#ops", text: "Payment pi_2 succeeded: 1.00 EUR" });
  });
});

describe("the risk prompt lives in a file", () => {
  it("interpolates the payment into the template from agent/prompts/", () => {
    // CLAUDE.md §7: prompts are .md files, never inline strings — so the wording can be
    // reviewed and changed without touching code.
    const prompt = buildRiskPrompt({ amountCents: 4200, currency: "usd", country: "GB", cardLast4: "4242" });

    expect(prompt).toContain("42.00 USD");
    expect(prompt).toContain("Country: GB");
    expect(prompt).toContain("Card ending: 4242");
    expect(prompt).not.toContain("{{");
  });

  it("does not leak the human-facing guidance above the separator", () => {
    const prompt = buildRiskPrompt({ amountCents: 100, currency: "eur", country: "IE", cardLast4: "1111" });

    expect(prompt).not.toContain("CLAUDE.md");
    expect(prompt).not.toContain("placeholders");
  });
});
