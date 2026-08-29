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
 * `merge_pull_request` does NOT carry patch evidence — its schema is owner / repo /
 * pullNumber / commit_title / merge_method. So the PR identity comes from those arguments,
 * and the changelog excerpt and diff are recovered from the `create_pull_request` call
 * earlier in the same thread, which is where the agent actually put them.
 *
 * What is not recoverable stays empty, and `testsPassed` stays null rather than defaulting
 * to true. A card that claims passing tests because a field was absent is the worst thing
 * this panel could do: a human is about to merge on the strength of it.
 */
function toApproval(event: ServerEvent, all: ServerEvent[]): PendingApproval[] {
  const created = all
    .filter((e) => e.thread_id === event.thread_id)
    .flatMap((e) => e.tool_calls ?? [])
    .findLast((c) => c.name === "create_pull_request");

  const prArgs = (created?.arguments ?? {}) as Record<string, unknown>;
  const prBody = String(prArgs.body ?? "");

  return (event.tool_calls ?? []).map((call, i) => {
    const args = (call.arguments ?? {}) as Record<string, unknown>;
    const owner = String(args.owner ?? "");
    const repo = String(args.repo ?? "");
    const pullNumber = Number(args.pullNumber ?? args.pull_number ?? 0);

    return {
      id: `${event.thread_id ?? ""}::${call.id ?? call.tool_call_id ?? i}`,
      action: call.name ?? "merge_pull_request",
      entry: parseEvidence(prBody, String(prArgs.title ?? call.name ?? "Pending action")),
      files: filesFrom(prBody),
      diff: fencedBlock(prBody, "diff"),
      testsPassed: testResultFrom(prBody),
      testOutput: fencedBlock(prBody, ""),
      prUrl: owner && repo && pullNumber ? `https://github.com/${owner}/${repo}/pull/${pullNumber}` : "",
      prNumber: pullNumber,
    };
  });
}

/** Pull a fenced code block out of the PR body the agent wrote. */
export function fencedBlock(body: string, lang: string): string {
  const match = new RegExp("```" + lang + "\\n([\\s\\S]*?)```").exec(body);
  return match?.[1]?.trim() ?? "";
}

export function filesFrom(body: string): string[] {
  const line = /\*\*Files changed:\*\*\s*(.+)/.exec(body)?.[1] ?? "";
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "").filter(Boolean);
}

/** Only a definite statement counts. Absence means unknown, not pass. */
export function testResultFrom(body: string): boolean | null {
  if (/Tests did not pass|❌/.test(body)) return false;
  if (/\d+ passed|✅/.test(body)) return true;
  return null;
}

/** Recover the changelog excerpt the PR body quotes (agent/prompts/pr-body.md). */
export function parseEvidence(body: string, fallbackTitle: string): PendingApproval["entry"] {
  const quoted = [...body.matchAll(/^>\s?(.*)$/gm)].map((m) => m[1] ?? "").join(" ").trim();
  const bold = /^>\s*\*\*(.+?)\*\*/m.exec(body)?.[1];

  return {
    vendor: /## Upstream change detected — (\S+)/.exec(body)?.[1] ?? "unknown",
    date: /\((\d{4}-\d{2}-\d{2})\)/.exec(body)?.[1] ?? "",
    title: bold ?? fallbackTitle,
    body: quoted.replace(bold ? `**${bold}**` : "", "").trim(),
    url: /Source:\s*(\S+)/.exec(body)?.[1] ?? "",
    breaking: /vendor-flagged breaking/.test(body),
    symbols: [...body.matchAll(/symbols: (.+)/g)].flatMap((m) =>
      [...(m[1] ?? "").matchAll(/`([^`]+)`/g)].map((s) => s[1] ?? ""),
    ),
  };
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
    const raw = await getJson<unknown>(`${API}/sessions/${sessionId}/events`, signal);

    // The session exists but its events did not load. Reporting connected here would show
    // "harness connected" with zero pending approvals — hiding a merge waiting on a human,
    // which is the one thing this panel must never do.
    if (raw === null) {
      return {
        ...EMPTY,
        connected: false,
        source: "trueforge",
        error: "connected to the harness, but could not read session events — approvals may be hidden",
      };
    }

    const events = unwrap<ServerEvent>(raw);

    const steps = events.map(toStep).filter((s): s is Step => s !== null).slice(-40);
    const answered = new Set(
      events.filter((e) => e.type === "user.tool_approval").map((e) => String(e.tool_call_id ?? "")),
    );
    const pending = events
      .filter((e) => e.type === "tool.approval_required")
      .flatMap((e) => toApproval(e, events))
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
