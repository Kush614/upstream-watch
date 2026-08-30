import { describe, it, expect } from "vitest";
import { classify, summarise, daysPast } from "../src/lib/severity.ts";

const NOW = new Date("2026-08-30T00:00:00Z");

describe("classify", () => {
  it("never escalates a change that touches nothing here", () => {
    // 85 of a real OpenAI run's 86 breaking entries are this. Treating them as urgent is
    // how a watcher becomes the thing everyone ignores.
    const v = classify({ touchesUs: false, breaking: true }, NOW);
    expect(v.severity).toBe("fyi");
  });

  it("says a passed shutdown already happened rather than warning about it", () => {
    const v = classify({ touchesUs: true, breaking: true, shutdown: "2026-07-23", symbol: "gpt-5.1-codex-mini" }, NOW);

    expect(v.severity).toBe("breaks");
    expect(v.alreadyPast).toBe(true);
    expect(v.because).toMatch(/already happened/);
  });

  it("keeps a future shutdown in the future tense", () => {
    const v = classify({ touchesUs: true, breaking: true, shutdown: "2026-12-11" }, NOW);
    expect(v.alreadyPast).toBe(false);
    expect(v.because).toMatch(/stops working on 2026-12-11/);
  });

  it("names the silent case for what it is", () => {
    const v = classify({ touchesUs: true, breaking: false, silent: true, symbol: "res.send" }, NOW);

    expect(v.severity).toBe("behaviour");
    expect(v.because).toMatch(/nothing will tell you/);
  });
});

describe("summarise", () => {
  it("separates what already broke from what is coming", () => {
    const line = summarise([
      classify({ touchesUs: true, breaking: true, shutdown: "2026-07-23" }, NOW),
      classify({ touchesUs: true, breaking: false, silent: true }, NOW),
      classify({ touchesUs: false, breaking: true }, NOW),
      classify({ touchesUs: false, breaking: true }, NOW),
    ]);

    expect(line).toBe("1 breaking now · 1 behaviour · 2 FYI");
  });

  it("says nothing when there is nothing to say", () => {
    expect(summarise([])).toBe("");
  });
});

describe("daysPast", () => {
  it("is negative for a date that has not arrived", () => {
    expect(daysPast("2026-07-23", NOW)).toBe(38);
    expect(daysPast("2026-12-11", NOW)).toBe(-103);
  });
});
