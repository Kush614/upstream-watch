import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { appendNote } from "../src/lib/notes.ts";
import { fromRepoRoot } from "../src/lib/paths.ts";

describe("NOTES.md is a dev artefact", () => {
  it("does not append from a production run", async () => {
    const before = await readFile(fromRepoRoot("NOTES.md"), "utf8");
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      // NOTES.md is tracked. A deployed run appending to it would mutate source as a side
      // effect of an error, in a checkout it does not own.
      await appendNote({ summary: "should not appear", where: "test", symptom: "test" });
      expect(await readFile(fromRepoRoot("NOTES.md"), "utf8")).toBe(before);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it("appends in development, where the file is the point", async () => {
    const previous = process.env.UPSTREAM_WATCH_NOTES;
    process.env.UPSTREAM_WATCH_NOTES = "0";
    try {
      const before = await readFile(fromRepoRoot("NOTES.md"), "utf8");
      await appendNote({ summary: "silenced", where: "test", symptom: "test" });
      expect(await readFile(fromRepoRoot("NOTES.md"), "utf8")).toBe(before);
    } finally {
      if (previous === undefined) delete process.env.UPSTREAM_WATCH_NOTES;
      else process.env.UPSTREAM_WATCH_NOTES = previous;
    }
  });
});
