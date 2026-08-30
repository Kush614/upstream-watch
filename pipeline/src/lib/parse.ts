import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { ConfigError } from "../errors.ts";
import type { ChangelogEntry, EmbeddedJsonSpec, ExtractionSpec, FieldSpec } from "../types.ts";

// No trailing \b: in "2026-08-20T00:00:00Z" the next character is a word character, so a
// boundary does not exist there and the match would fail. A negative lookahead for a digit
// gets the same protection without that trap.
const ISO_DATE = /(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)/;

/* ────────────────────────────── shared helpers ────────────────────────────── */

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** e.g. "Jan 20, 2027" — the shape most vendors print for humans. */
const TEXT_DATE = /\b([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/;

/**
 * Normalise a date to YYYY-MM-DD.
 *
 * Handles "2026-08-26.dahlia", "Posted 2026-08-26", and human formats like "Jan 20, 2027" —
 * OpenAI's deprecation tables use the last of those, and the schema requires ISO.
 */
function normaliseDate(raw: string): string {
  // Vendors print non-breaking and en-dash hyphens in dates; OpenAI's tables use U+2011.
  const value = raw.replace(/[\u2010-\u2015\u2212]/g, "-");

  const iso = ISO_DATE.exec(value)?.[1];
  if (iso) return iso;

  const text = TEXT_DATE.exec(value);
  if (!text) return "";

  const month = MONTHS[(text[1] ?? "").toLowerCase()];
  return month ? `${text[3]}-${month}-${(text[2] ?? "").padStart(2, "0")}` : "";
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Resolve a permalink against the page it came from.
 *
 * Changelogs routinely use root-relative hrefs. Copied verbatim those fail the schema's
 * `uri` format, so every entry would be dropped and extraction would look broken.
 */
function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return "";
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/* ──────────────────────────── strategy: css ──────────────────────────────── */

function fieldParts(spec: FieldSpec | undefined): { selector?: string; attr?: string; value?: string } {
  if (!spec) return {};
  return typeof spec === "string" ? { selector: spec } : spec;
}

/**
 * Text content with `code` spans preserved as backticked tokens, so symbol matching can
 * tell an API name from an ordinary English word.
 */
function textWithCodeSpans(el: HTMLElement): string {
  const clone = parseHtml(el.outerHTML);
  for (const code of clone.querySelectorAll("code")) {
    code.replaceWith(parseHtml(`<span>\`${code.text.trim()}\`</span>`));
  }
  return collapse(clone.text);
}

/** Read one field. Returns "" rather than throwing — a missing field is a schema problem. */
function readField(entry: HTMLElement, spec: FieldSpec | undefined): string {
  const { selector, attr, value } = fieldParts(spec);
  if (value !== undefined) return value;

  const el = selector ? entry.querySelector(selector) : entry;
  if (!el) return "";
  return (attr ? (el.getAttribute(attr) ?? "") : textWithCodeSpans(el)).trim();
}

function extractCss(html: string, spec: ExtractionSpec): ChangelogEntry[] {
  const root = parseHtml(html);

  return root.querySelectorAll(spec.entry_selector ?? "").map((el) => {
    const date = normaliseDate(readField(el, spec.fields?.date));

    return {
    vendor: spec.vendor,
    date,
    // Only where the page itself is a table of deadlines. A changelog's date is when the
    // entry was written, and copying it here would tell every reader their service broke
    // on the day the vendor published a note.
    ...(spec.date_is_shutdown === true && date ? { shutdown: date } : {}),
    title: readField(el, spec.fields?.title),
    body: readField(el, spec.fields?.body),
    url: resolveUrl(readField(el, spec.fields?.url), spec.url),
    // Normally classify() decides. A source flagged breaking_default is one where the page
    // itself is the claim, so the entry carries it and classify reads it as vendor-flagged.
    breaking: spec.breaking_default === true,
    };
  });
}

/* ─────────────────────── strategy: embedded-json ─────────────────────────── */

/** Read the JSON object that follows `marker` in the page source. */
export function readEmbeddedJson(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  if (at === -1) return null;

  const source = html.slice(at + marker.length);
  // The object is followed by arbitrary script, so scan for its balanced end rather than
  // assuming a terminator.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(0, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Walk a dotted path. `foo[]` fans out over an array; `foo[0]` indexes it. */
export function walkPath(root: unknown, path: string): unknown[] {
  let current: unknown[] = [root];

  for (const segment of path.split(".")) {
    const fanOut = segment.endsWith("[]");
    const indexed = /^(.*)\[(\d+)\]$/.exec(segment);
    const key = fanOut ? segment.slice(0, -2) : (indexed?.[1] ?? segment);

    const next: unknown[] = [];
    for (const node of current) {
      const value = key === "" ? node : (node as Record<string, unknown>)?.[key];
      if (value === undefined || value === null) continue;

      if (fanOut && Array.isArray(value)) next.push(...value);
      else if (indexed && Array.isArray(value)) {
        const item = value[Number(indexed[2])];
        if (item !== undefined) next.push(item);
      } else next.push(value);
    }
    current = next;
  }
  return current;
}

function scalar(entry: unknown, path: string): string {
  const [value] = walkPath(entry, path);
  if (value === undefined || value === null) return "";
  return Array.isArray(value) ? value.map(String).join(", ") : String(value);
}

/** Render `https://x/{train}#{slug}` against an entry. */
function renderTemplate(entry: unknown, template: string): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => scalar(entry, path));
}

/**
 * Build the body from several paths.
 *
 * The vendor's own symbol lists (`changed`, `affected`) are folded in here so that the
 * substring symbol matching in specs/scraper-pipeline.md §3 can see them, without
 * widening schemas/changelog-entry.json.
 */
function buildBody(entry: unknown, paths: string[]): string {
  return collapse(paths.map((p) => scalar(entry, p)).filter(Boolean).join("\n\n"));
}

function extractEmbeddedJson(html: string, spec: ExtractionSpec, json: EmbeddedJsonSpec): ChangelogEntry[] {
  const state = readEmbeddedJson(html, json.marker);
  if (state === null) return [];

  return walkPath(state, json.entries_path).map((raw) => ({
    vendor: spec.vendor,
    date: normaliseDate(scalar(raw, json.map.date)),
    title: collapse(scalar(raw, json.map.title)),
    body: buildBody(raw, json.map.body),
    url: json.map.url.includes("{")
      ? renderTemplate(raw, json.map.url)
      : resolveUrl(scalar(raw, json.map.url), spec.url),
    breaking: scalar(raw, json.map.breaking).toLowerCase() === "true",
  }));
}

/* ──────────────────────────────── entry point ────────────────────────────── */

/**
 * Extract entries using the vendor's spec.
 *
 * Returns [] when the spec matches nothing. The caller decides what that means — for us
 * it is a SchemaMismatch change event, not an error (specs/scraper-pipeline.md §3).
 */
export function extractEntries(html: string, spec: ExtractionSpec): ChangelogEntry[] {
  if (spec.strategy === "embedded-json") {
    if (!spec.json) throw new ConfigError(`Vendor "${spec.vendor}": missing json spec`, { vendor: spec.vendor });
    return extractEmbeddedJson(html, spec, spec.json);
  }
  return extractCss(html, spec);
}
