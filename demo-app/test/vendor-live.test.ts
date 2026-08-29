import { describe, it, expect } from "vitest";
import { createOpenAI } from "../src/risk.ts";

/**
 * The only test here that actually calls the vendor.
 *
 * It runs solely when the proof runner points `OPENAI_API_BASE` at its stub and sets
 * `PROOF_RUN=1`. Every other test uses a fake client and would pass whatever the vendor
 * does — which is the whole reason a model shutdown is invisible until production.
 *
 * At a commit pinned to a retired model this fails, because the vendor says so.
 */
const enabled = process.env.PROOF_RUN === "1" && Boolean(process.env.OPENAI_API_BASE);

describe.runIf(enabled)("risk check against the live vendor", () => {
  it("gets a risk assessment back", async () => {
    const openai = createOpenAI("test-key");

    const assessment = await openai.summariseRisk({
      amountCents: 4200,
      currency: "usd",
      country: "GB",
      cardLast4: "4242",
    });

    expect(["low", "medium", "high"]).toContain(assessment.level);
  });
});
