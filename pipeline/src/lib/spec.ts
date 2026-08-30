import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.ts";
import { fromRepoRoot } from "./paths.ts";
import type { ExtractionSpec } from "../types.ts";

/**
 * Extraction specs live in the YAML block of the skill, not in a separate config file
 * (specs/scraper-pipeline.md §1). That is deliberate: the harness loads SKILL.md, so the
 * spec the agent reads and the spec the pipeline executes are the same bytes.
 */
export const SKILL_FILE = "skills/brightdata-changelog-scraper/SKILL.md";

/** Pull the last fenced ```yaml block out of a markdown file. */
export function extractYamlBlock(markdown: string): string {
  const blocks = [...markdown.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  const block = blocks.at(-1);

  if (!block) throw new ConfigError(`No \`\`\`yaml block found in ${SKILL_FILE}`);
  return block;
}

function normaliseSpec(vendor: string, raw: Record<string, unknown>): ExtractionSpec {
  const strategy = (raw.strategy as ExtractionSpec["strategy"]) ?? "css";

  if (strategy !== "css" && strategy !== "embedded-json") {
    throw new ConfigError(`Vendor "${vendor}": unknown strategy "${String(strategy)}"`, { vendor });
  }
  if (typeof raw.url !== "string" || raw.url.length === 0) {
    throw new ConfigError(`Vendor "${vendor}": url is required`, { vendor });
  }

  if (strategy === "css" && typeof raw.entry_selector !== "string") {
    throw new ConfigError(`Vendor "${vendor}": strategy css needs an entry_selector`, { vendor });
  }
  if (strategy === "embedded-json") {
    const json = raw.json as ExtractionSpec["json"];
    if (!json?.marker || !json?.entries_path || !json?.map) {
      throw new ConfigError(`Vendor "${vendor}": strategy embedded-json needs json.{marker,entries_path,map}`, { vendor });
    }
  }

  return {
    vendor,
    url: raw.url,
    strategy,
    entry_selector: raw.entry_selector as string | undefined,
    fields: raw.fields as ExtractionSpec["fields"],
    json: raw.json as ExtractionSpec["json"],
    breaking_default: raw.breaking_default === true,
    // Whether this page's date column is a deadline or just a publication date.
    date_is_shutdown: raw.date_is_shutdown === true,
    match_fields: Array.isArray(raw.match_fields)
      ? (raw.match_fields.filter((f) => f === "title" || f === "body") as Array<"title" | "body">)
      : undefined,
    breaking_hint: Array.isArray(raw.breaking_hint) ? raw.breaking_hint.map(String) : [],
  };
}

/** Parse every vendor's extraction spec out of the skill. */
export function parseSpecs(markdown: string): Map<string, ExtractionSpec> {
  let doc: { vendors?: Record<string, Record<string, unknown>> };
  try {
    doc = parseYaml(extractYamlBlock(markdown)) as typeof doc;
  } catch (cause) {
    throw new ConfigError(`Extraction spec YAML in ${SKILL_FILE} does not parse`, { cause: String(cause) });
  }

  if (!doc?.vendors || typeof doc.vendors !== "object") {
    throw new ConfigError(`Extraction spec in ${SKILL_FILE} has no "vendors" map`);
  }

  return new Map(
    Object.entries(doc.vendors).map(([vendor, raw]) => [vendor, normaliseSpec(vendor, raw)]),
  );
}

export async function loadSpecs(file = SKILL_FILE): Promise<Map<string, ExtractionSpec>> {
  return parseSpecs(await readFile(fromRepoRoot(file), "utf8"));
}

export async function loadSpec(vendor: string, file = SKILL_FILE): Promise<ExtractionSpec> {
  const spec = (await loadSpecs(file)).get(vendor);
  if (!spec) throw new ConfigError(`No extraction spec for vendor "${vendor}" in ${file}`, { vendor });
  return spec;
}
