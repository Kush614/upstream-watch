import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { ConfigError } from "../errors.ts";
import type { ChangelogEntry, EmbeddedJsonSpec, ExtractionSpec, FieldSpec } from "../types.ts";

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/* ────────────────────────────── shared helpers ────────────────────────────── */

/** Pull a date out of a value, tolerating "2026-08-26.dahlia" or "Posted 2026-08-26". */
function normaliseDate(value: string): string {
  return ISO_DATE.exec(value)?.[1] ?? "";
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

function fieldParts(spec: FieldSpec | undefined): { selector?: string; attr?: string } {
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
  const { selector, attr } = fieldParts(spec);
  const el = selector ? entry.querySelector(selector) : entry;
  if (!el) return "";
  return (attr ? (el.getAttribute(attr) ?? "") : textWithCodeSpans(el)).trim();
}

function extractCss(html: string, spec: ExtractionSpec): ChangelogEntry[] {
  const root = parseHtml(html);

  return root.querySelectorAll(spec.entry_selector ?? "").map((el) => ({
    vendor: spec.vendor,
    date: normaliseDate(readField(el, spec.fields?.date)),
    title: readField(el, spec.fields?.title),
    body: readField(el, spec.fields?.body),
    url: resolveUrl(readField(el, spec.fields?.url), spec.url),
    breaking: false, // decided by classify(), not by parsing
  }));
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
