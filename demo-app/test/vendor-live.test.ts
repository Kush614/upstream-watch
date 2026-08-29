import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createOpenAI } from "../src/risk.ts";
import { recordVendorCalls } from "./proof-receipt.ts";

/**
 * The only test here that actually calls OpenAI.
 *
 * Every other test in this suite uses a fake client, so it passes no matter what the
 * vendor does — which is exactly why a model shutdown stays invisible until production.
 * This one hits the real API with the real key, so at a commit pinned to a retired model
 * it fails because OpenAI says the model is gone, not because we decided it should.
 *
 * It runs only under the proof runner (`PROOF_RUN=1`), so a normal `pnpm verify` neither
 * needs a key nor spends anything.
 */
const enabled = process.env.PROOF_RUN === "1" && Boolean(process.env.OPENAI_API_KEY);

describe.runIf(enabled)("risk check against the real OpenAI API", () => {
  let restore: () => void = () => undefined;

  beforeAll(() => {
    const receipt = process.env.PROOF_RECEIPT;
    if (receipt) restore = recordVendorCalls(receipt);
  });

  afterAll(() => restore());

  it("gets a risk assessment back", async () => {
    const openai = createOpenAI();

    const assessment = await openai.summariseRisk({
      amountCents: 4200,
      currency: "usd",
      country: "GB",
      cardLast4: "4242",
    });

    expect(["low", "medium", "high"]).toContain(assessment.level);
  });
});
