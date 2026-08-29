/**
 * The two headlines. One file, because these are the sentences a non-technical judge reads
 * and they should be editable without touching a component.
 *
 * `{vendor}` and `{date}` are filled from the change that was found.
 */
export const HEADLINES = {
  outage: "CHECKOUT DOWN SINCE 2 AM — {vendor} removed a parameter nobody noticed",
  fixed: "Nothing happened on {date}.",
};

export function fill(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
