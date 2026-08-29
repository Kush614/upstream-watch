import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import { extractEntries } from "./parse.ts";
import { validateEntries } from "./validate.ts";
import { withClassification } from "./classify.ts";
import type { ExtractionSpec, FieldSpec } from "../types.ts";

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const HEADINGS = "h1, h2, h3, h4, h5, h6";

/** Minimum repeated elements before something looks like a list of entries. */
const MIN_ENTRIES = 2;

export interface RepairProposal {
  spec: ExtractionSpec;
  /** How many entries the proposed spec extracts and validates cleanly. */
  validEntries: number;
  /** Human-readable account of what changed, for the PR body. */
  rationale: string;
}

/** A stable-ish selector for an element: prefer tag.class, fall back to tag. */
function selectorFor(el: HTMLElement): string {
  const tag = el.tagName?.toLowerCase();
  if (!tag) return "";
  const className = el.classList.values().next().value;
  return className ? `${tag}.${CSS_ESCAPE(className)}` : tag;
}

/** node-html-parser takes raw selectors; only escape what would break one. */
function CSS_ESCAPE(value: string): string {
  return value.replace(/([^\w-])/g, "\\$1");
}

/** Find an attribute on the element whose value looks like a date. */
function dateAttrOf(el: HTMLElement): string | null {
  for (const [name, value] of Object.entries(el.attributes)) {
    if (ISO_DATE.test(value)) return name;
  }
  return null;
}

/** Derive field selectors by looking at what an entry element actually contains. */
function deriveFields(entry: HTMLElement): ExtractionSpec["fields"] | null {
  const dateAttr = dateAttrOf(entry);
  const dateEl = dateAttr
    ? null
    : entry.querySelectorAll("*").find((el) => ISO_DATE.test(el.text) && el.childNodes.length <= 3);

  const date: FieldSpec | null = dateAttr
    ? { attr: dateAttr }
    : dateEl
      ? { selector: selectorFor(dateEl) }
      : null;

  const heading = entry.querySelector(HEADINGS);
  const anchor = entry.querySelector("a[href]");

  // Body: the largest text block that is not the heading itself.
  const body = entry
    .querySelectorAll("*")
    .filter((el) => el !== heading && !el.querySelector(HEADINGS) && el.text.trim().length > 0)
    .sort((a, b) => b.text.length - a.text.length)[0];

  if (!date || !heading || !body) return null;

  return {
    date,
    title: { selector: selectorFor(heading) },
    body: { selector: selectorFor(body) },
    url: anchor ? { selector: selectorFor(anchor), attr: "href" } : { attr: "id" },
  };
}

/** Candidate entry-container selectors, most promising first. */
function candidateContainers(root: HTMLElement): string[] {
  const counts = new Map<string, number>();

  for (const el of root.querySelectorAll("*")) {
    const selector = selectorFor(el);
    if (!selector) continue;
    counts.set(selector, (counts.get(selector) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([selector, count]) => count >= MIN_ENTRIES && selector.includes("."))
    .sort((a, b) => b[1] - a[1])
    .map(([selector]) => selector);
}

/**
 * Propose a new extraction spec by reading the cached HTML.
 *
 * Runs entirely offline against the bytes that broke, which is why caching before parsing
 * is non-negotiable (CLAUDE.md §6). Nothing here writes to disk: the proposal goes into a
 * PR, because self-repair never silently mutates config (specs/scraper-pipeline.md §4).
 */
export function proposeExtractionSpec(html: string, current: ExtractionSpec): RepairProposal | null {
  const root = parseHtml(html);
  let best: RepairProposal | null = null;

  for (const container of candidateContainers(root)) {
    const elements = root.querySelectorAll(container);
    const first = elements[0];
    if (!first) continue;

    const fields = deriveFields(first);
    if (!fields) continue;

    const spec: ExtractionSpec = {
      vendor: current.vendor,
      version: current.version + 1,
      entry: container,
      fields,
    };

    const entries = extractEntries(html, spec).map(withClassification);
    const { valid } = validateEntries(entries);

    if (valid.length >= MIN_ENTRIES && (!best || valid.length > best.validEntries)) {
      best = {
        spec,
        validEntries: valid.length,
        rationale:
          `Entry container \`${current.entry}\` matched 0 elements. ` +
          `\`${container}\` matches ${elements.length} and yields ${valid.length} ` +
          `schema-valid entries.`,
      };
    }
  }

  return best;
}
