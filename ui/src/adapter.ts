import type { PendingApproval, SessionState, Step, StepKind } from "./types.ts";

/**
 * Talks to the TrueForge server. This is the only file that does.
 *
 * Routes and payloads below are taken from a running server's own OpenAPI document
 * (`GET /api/v1/openapi.json` on :8790), not from guesswork:
 *
 *   GET  /api/v1/sessions                       list sessions
 *   GET  /api/v1/sessions/{id}/events           the event stream the Doing panel renders
 *   POST /api/v1/sessions/{id}/turns            resume a turn — including approvals
 *
 * A pending approval is not a REST resource. It arrives as a `tool.approval_required`
 * event carrying `thread_id` and `tool_calls`, and is answered by posting a
 * `user.tool_approval` item back into a turn. That is why state survives a browser
 * refresh: the pending call lives in the harness's session, not in this tab.
 *
 * When the server is unreachable the panels fall back to a local feed written by
 * `pnpm demo:feed`, and the header says "local feed" rather than implying a live run.
 */

const API = "/api/v1";
const LOCAL_FEED = "/session.json";

const EMPTY: SessionState = {
  connected: false,
  source: "local",
  summary: { lastCheck: null, eventsSeen: 0, prsOpened: 0, prsMerged: 0, pendingApprovals: 0 },
  steps: [],
  pending: [],
  done: [],
};

/* ─────────────────────────── server event shapes ─────────────────────────── */

interface ToolCallRef {
  id?: string;
  tool_call_id?: string;
  name?: string;
  arguments?: unknown;
}

interface ServerEvent {
  type: string;
  id?: string;
  created_at?: string;
  thread_id?: string;
  tool_calls?: ToolCallRef[];
  [key: string]: unknown;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The server wraps collections as `{ data: [...] }`. */
function unwrap<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const data = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/* ───────────────────────────── event → panel ─────────────────────────────── */

const STEP_KIND: Array<[RegExp, StepKind]> = [
  [/approval/, "approval"], [/sandbox/, "sandbox"], [/subagent|agent\.start/, "subagent"],
  [/tool\.call|tool\.result/, "skill"], [/message|turn/, "diff"],
];

function toStep(event: ServerEvent, index: number): Step | null {
  if (event.type.startsWith("chunk.")) return null; // token noise, not a step

  const kind = STEP_KIND.find(([re]) => re.test(event.type))?.[1] ?? "skill";
  const toolName = event.tool_calls?.[0]?.name;

  return {
    id: event.id ?? `e${index}`,
    kind,
    label: toolName ? `${event.type.replace(/[._]/g, " ")}: ${toolName}` : event.type.replace(/[._]/g, " "),
    at: event.created_at ?? new Date().toISOString(),
    status: event.type === "tool.approval_required" ? "warn" : event.type.includes("error") ? "fail" : "ok",
  };
}

/**
 * Turn a `tool.approval_required` event into an approval card.
 *
 * The changelog excerpt and diff come from the tool call's own arguments — the agent
 * passes them when it asks to merge — so the card shows the scraped text rather than a
 * summary of it (specs/scraper-pipeline.md §6).
 */
function toApproval(event: ServerEvent): PendingApproval[] {
  return (event.tool_calls ?? []).map((call, i) => {
    const args = (call.arguments ?? {}) as Record<string, string | undefined>;
    return {
      id: `${event.thread_id ?? ""}::${call.id ?? call.tool_call_id ?? i}`,
      action: call.name ?? "merge_pull_request",
      entry: {
        vendor: args.vendor ?? "unknown",
        date: args.date ?? "",
        title: args.title ?? call.name ?? "Pending action",
        body: args.excerpt ?? args.body ?? "",
        url: args.url ?? "",
        breaking: args.breaking === "true",
        symbols: args.symbols ? String(args.symbols).split(",").map((s) => s.trim()) : [],
      },
      files: args.files ? String(args.files).split(",").map((s) => s.trim()) : [],
      diff: args.diff ?? "",
      testsPassed: args.testsPassed !== "false",
      testOutput: args.testOutput ?? "",
      prUrl: args.prUrl ?? "",
      prNumber: Number(args.prNumber ?? 0),
    };
  });
}

/* ──────────────────────────────── loading ────────────────────────────────── */

async function currentSessionId(signal?: AbortSignal): Promise<string | null> {
  const sessions = unwrap<{ id?: string; session_id?: string }>(
    await getJson(`${API}/sessions`, signal),
  );
  const newest = sessions.at(-1);
  return newest?.id ?? newest?.session_id ?? null;
}

export async function loadSession(signal?: AbortSignal): Promise<SessionState> {
  const sessionId = await currentSessionId(signal);

  if (sessionId) {
    const events = unwrap<ServerEvent>(await getJson(`${API}/sessions/${sessionId}/events`, signal));

    const steps = events.map(toStep).filter((s): s is Step => s !== null).slice(-40);
    const answered = new Set(
      events.filter((e) => e.type === "user.tool_approval").map((e) => String(e.tool_call_id ?? "")),
    );
    const pending = events
      .filter((e) => e.type === "tool.approval_required")
      .flatMap(toApproval)
      .filter((a) => !answered.has(a.id.split("::")[1] ?? ""));

    return {
      ...EMPTY,
      connected: true,
      source: "trueforge",
      steps,
      pending,
      summary: {
        lastCheck: steps.at(-1)?.at ?? null,
        eventsSeen: events.length,
        prsOpened: events.filter((e) => e.tool_calls?.some((c) => c.name === "create_pull_request")).length,
        prsMerged: events.filter((e) => e.tool_calls?.some((c) => c.name === "merge_pull_request")).length,
        pendingApprovals: pending.length,
      },
    };
  }

  const local = await getJson<Partial<SessionState>>(LOCAL_FEED, signal);
  return local ? { ...EMPTY, ...local, connected: false, source: "local" } : EMPTY;
}

/**
 * Approve or deny a pending tool call.
 *
 * The gate lives in the harness: this posts a decision and the agent resumes or does not.
 * A denial carries a reason, which the agent is shown (specs/agent.md §Failure modes).
 */
export async function decide(
  approvalId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [threadId, toolCallId] = approvalId.split("::");
  const sessionId = await currentSessionId();

  if (!sessionId || !threadId || !toolCallId) {
    return { ok: false, error: "no live session — approvals need the harness running" };
  }

  try {
    const res = await fetch(`${API}/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stream: false,
        input: [
          {
            type: "user.tool_approval",
            thread_id: threadId,
            tool_call_id: toolCallId,
            approval: decision === "approve" ? { status: "allow" } : { status: "deny", reason },
          },
        ],
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `${res.status} ${res.statusText}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Poll for session changes. */
export function subscribe(onState: (state: SessionState) => void, intervalMs = 2000): () => void {
  const controller = new AbortController();
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    onState(await loadSession(controller.signal));
    if (!stopped) setTimeout(tick, intervalMs);
  };
  void tick();

  return () => {
    stopped = true;
    controller.abort();
  };
}
