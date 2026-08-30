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

/**
 * Ask the agent a question in an existing session and wait for its reply.
 *
 * The harness chains turns on `previous_turn_id`, so posting while a turn is running forks
 * the thread. Callers must not send a second question until this resolves.
 */
export async function askInSession(sessionId: string, question: string): Promise<string> {
  const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stream: false, input: [{ type: "user.message", content: question }] }),
  });

  if (!res.ok) {
    throw new TrueForgeClientError(`question rejected: ${res.status} ${res.statusText}`, { sessionId, status: res.status });
  }

  const turnId = ((await res.json()) as { data?: { id?: string } }).data?.id;
  if (!turnId) throw new TrueForgeClientError("turn accepted but carried no id", { sessionId });

  // Poll the turn's own events. There is an SSE subscribe route, but a question is one
  // short answer, and a polled read cannot leave a socket open behind a closed panel.
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const turn = await getJson<{ data?: { state?: { status?: string } } }>(
      `/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
    );
    if (turn.data?.state?.status === "running") continue;

    const events = await getJson<{ data?: Array<Record<string, unknown>> }>(
      `/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/events`,
    );
    const said = (events.data ?? [])
      .map((item) => (item.event ?? item) as { type?: string; content?: unknown })
      .filter((e) => e.type === "model.message" && typeof e.content === "string" && e.content.trim())
      .map((e) => e.content as string);

    if (said.length) return said.at(-1) as string;
    throw new TrueForgeClientError("the agent finished the turn without saying anything", { sessionId, turnId });
  }

  throw new TrueForgeClientError("the agent did not answer within three minutes", { sessionId, turnId });
}
