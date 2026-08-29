import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import type { ChangelogEntry, ExtractionSpec, FieldSpec } from "../types.ts";

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Read one field out of an entry element.
 * Returns "" rather than throwing - a missing field is a validation problem, and
 * validation failure is a change event, not a crash (CLAUDE.md §6).
 */
function readField(entry: HTMLElement, spec: FieldSpec): string {
  const el = spec.selector ? entry.querySelector(spec.selector) : entry;
  if (!el) return "";
  const raw = spec.attr ? (el.getAttribute(spec.attr) ?? "") : textWithCodeSpans(el);
  return raw.trim();
}

/**
 * Text content with `code` spans preserved as backticked tokens.
 *
 * This is what lets relevance matching distinguish "the `source` parameter" from the
 * ordinary English word "source" (specs/scraper-pipeline.md §5).
 */
function textWithCodeSpans(el: HTMLElement): string {
  const clone = parseHtml(el.outerHTML);
  for (const code of clone.querySelectorAll("code")) {
    code.replaceWith(parseHtml(`<span>\`${code.text.trim()}\`</span>`));
  }
  return collapse(clone.text);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Pull a date out of a field value, tolerating "Posted on 2026-08-28" style wrappers. */
function normaliseDate(value: string): string {
  return ISO_DATE.exec(value)?.[1] ?? "";
}

/**
 * Extract entries from a page using the vendor's extraction spec.
 *
 * Returns [] when the spec matches nothing. The caller decides what that means -
 * for us it is a change event, not an error (specs/scraper-pipeline.md §4).
 */
export function extractEntries(html: string, spec: ExtractionSpec): ChangelogEntry[] {
  const root = parseHtml(html);

  return root.querySelectorAll(spec.entry).map((el) => ({
    vendor: spec.vendor,
    date: normaliseDate(readField(el, spec.fields.date)),
    title: readField(el, spec.fields.title),
    body: readField(el, spec.fields.body),
    url: readField(el, spec.fields.url),
    // Filled in by classify(); parsing does not decide what is breaking.
    breaking: false,
  }));
}
