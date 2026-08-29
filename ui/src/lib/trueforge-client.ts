/**
 * Transport for the TrueForge HTTP API.
 *
 * Kept apart from the mapping in `trueforge-events.ts` so endpoint and error handling live
 * in one place. The UI never imports this — only `adapter.real.ts` does.
 *
 * Routes verified against a running server's own OpenAPI document.
 */

export class TrueForgeClientError extends Error {
  readonly context: Record<string, unknown>;
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "TrueForgeClientError";
    this.context = context;
  }
}

const API = "/api/v1";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new TrueForgeClientError(`${path} -> ${res.status} ${res.statusText}`, { path, status: res.status });
  return (await res.json()) as T;
}

export async function fetchSessions(signal?: AbortSignal): Promise<unknown> {
  return getJson("/sessions", signal);
}

export async function fetchEvents(sessionId: string, signal?: AbortSignal): Promise<unknown> {
  return getJson(`/sessions/${encodeURIComponent(sessionId)}/events`, signal);
}

/** Answer a pending approval. Returns the server's verdict rather than swallowing it. */
export async function postDecision(
  sessionId: string,
  threadId: string,
  toolCallId: string,
  approval: { status: "allow" } | { status: "deny"; reason?: string },
): Promise<void> {
  const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stream: false,
      input: [{ type: "user.tool_approval", thread_id: threadId, tool_call_id: toolCallId, approval }],
    }),
  });

  if (!res.ok) {
    throw new TrueForgeClientError(`decision rejected: ${res.status} ${res.statusText}`, { sessionId, status: res.status });
  }
}
