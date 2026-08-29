/**
 * Recording what the code actually sent.
 *
 * The proof screen claims that the request and response it shows are the ones a real
 * commit produced against the real vendor. That claim is only true if something observes
 * the call rather than reconstructing it, so this wraps `fetch` and writes down the
 * exchange as it happens. Nothing here composes a request.
 *
 * The Authorization header is deliberately never recorded: the receipt is written to disk
 * and then rendered in a browser.
 */

import { writeFileSync } from "node:fs";

export interface Receipt {
  request: { method: string; url: string; body: unknown };
  status: number;
  excerpt: string;
  at: string;
}

const EXCERPT_LIMIT = 400;

/** Whatever the vendor said, trimmed to something a card can hold. */
function excerptOf(status: number, text: string): string {
  try {
    const body = JSON.parse(text) as { error?: { message?: string }; output_text?: string };
    if (body.error?.message) return `${status} — ${body.error.message}`;
    if (body.output_text) return `${status} — ${body.output_text}`;
  } catch {
    // Not JSON. The raw text is still the honest answer.
  }
  return `${status} — ${text.slice(0, EXCERPT_LIMIT)}`;
}

/**
 * Wrap `fetch` so the last vendor exchange lands at `path`.
 *
 * Returns a restore function. A failed write throws: a proof run that silently produced no
 * receipt would leave the screen showing a previous run's numbers under this run's heading.
 */
export function recordVendorCalls(path: string): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Read from a clone so the caller still gets an unconsumed body.
    const text = await res.clone().text();
    let body: unknown = init?.body;
    try {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    } catch {
      // Leave it as the raw string; a body we cannot parse is still what was sent.
    }

    const receipt: Receipt = {
      request: { method: init?.method ?? "GET", url, body },
      status: res.status,
      excerpt: excerptOf(res.status, text),
      at: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(receipt, null, 2));

    return res;
  };

  return () => {
    globalThis.fetch = original;
  };
}
