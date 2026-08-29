import type { DoneItem, PendingApproval, SessionState, Step, StepKind } from "./types.ts";

/**
 * Talks to the TrueForge server. This is the only file that does.
 *
 * Every shape below was read off a running server, not guessed. Three things are easy to
 * get wrong and were wrong here first:
 *
 *  1. `GET /sessions` returns NEWEST FIRST, so the newest is [0], not at(-1).
 *  2. MCP tools are invoked through a `call_tool` wrapper — `create_pull_request` never
 *     appears as a tool name. The real call is `{mcp_server, tool_name, input}`.
 *  3. An approval event's `tool_calls` carry only `{id, source_event_id}`. The arguments
 *     live in the event that id points back at, so the pending call has to be resolved
 *     against the event index before there is anything to show a human.
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
  vendors: [],
};

interface RawToolCall {
  id?: string;
  source_event_id?: string;
  name?: string;
  function?: { name?: string; arguments?: string };
}

interface ServerEvent {
  type: string;
  id?: string;
  created_at?: string;
  thread_id?: string;
  title?: string;
  tool_calls?: RawToolCall[];
  content?: unknown;
  state?: { status?: string; output?: { content?: string } };
}

/** An MCP call, once unwrapped from the `call_tool` envelope. */
interface McpCall {
  server: string;
  tool: string;
  input: Record<string, unknown>;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const data = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/**
 * The events endpoint returns `{ data: [{ event: {...} }] }` — each item wraps the event.
 * Passing the envelope to the mappers made every panel render empty against a live
 * session while looking perfectly fine against a hand-built fixture.
 */
export function unwrapEvents(payload: unknown): ServerEvent[] {
  return unwrapList<{ event?: ServerEvent } & ServerEvent>(payload).map((e) => e.event ?? (e as ServerEvent));
}

/** Tools the agent may not call without a human (specs/agent.md §Approvals). */
const GATED_TOOLS = ["merge_pull_request", "close_pull_request", "delete_repository"];

/**
 * `tool.approval_required` is always an approval. `tool.response_required` is the generic
 * "this call needs a response" event — it is an approval only when the call it points at is
 * a gated one. Treating every response_required as a gate produced phantom "Pending action"
 * cards for ordinary tool calls.
 */
function isApprovalEvent(type: string): boolean {
  return type === "tool.approval_required" || type === "tool.response_required";
}

function isGatedCall(mcp: McpCall | null): boolean {
  return mcp !== null && GATED_TOOLS.includes(mcp.tool);
}

function parseArgs(call: RawToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Turn a raw tool call into the MCP call it actually represents, if it is one. */
function asMcpCall(call: RawToolCall): McpCall | null {
  const name = call.function?.name ?? call.name;
  if (name !== "call_tool") return null;

  const args = parseArgs(call);
  return {
    server: String(args.mcp_server ?? ""),
    tool: String(args.tool_name ?? ""),
    input: (args.input ?? {}) as Record<string, unknown>,
  };
}

/* ─────────────────────────────── steps ──────────────────────────────────── */

function stepKind(event: ServerEvent, mcp: McpCall | null, toolName: string): StepKind {
  if (isApprovalEvent(event.type)) return "approval";
  if (mcp?.tool === "merge_pull_request") return "merge";
  if (mcp?.tool.includes("pull_request")) return "pr";
  if (event.type.startsWith("thread.")) return "subagent";
  if (toolName === "create_sub_agent") return "subagent";
  if (event.type === "sandbox.created") return "sandbox";
  if (toolName === "exec") return "sandbox";
  return "skill";
}

export function toSteps(events: ServerEvent[]): Step[] {
  const steps: Step[] = [];

  for (const [i, event] of events.entries()) {
    if (event.type.startsWith("chunk.")) continue;

    if (event.type === "thread.created" || event.type === "thread.done") {
      steps.push({
        id: event.id ?? `t${i}`,
        kind: "subagent",
        label: event.title ? `subagent: ${event.title}` : event.type.replace(".", " "),
        at: event.created_at ?? "",
        status: event.type === "thread.done" ? "ok" : "running",
      });
      continue;
    }

    for (const call of event.tool_calls ?? []) {
      const name = call.function?.name ?? call.name ?? "";
      const mcp = asMcpCall(call);
      if (!name) continue;

      const label = mcp
        ? `${mcp.server}: ${mcp.tool}`
        : name === "exec"
          ? `exec: ${String(parseArgs(call).intent ?? "").slice(0, 60)}`
          : name;

      steps.push({
        id: call.id ?? `${event.id}-${name}`,
        kind: stepKind(event, mcp, name),
        label,
        at: event.created_at ?? "",
        status: "ok",
      });
    }
  }
  return steps.slice(-60);
}

/* ──────────────────────────── approvals ─────────────────────────────────── */

/** Parse a unified diff into before/after line pairs for side-by-side display. */
export function splitDiff(diff: string): { before: string[]; after: string[] } {
  const before: string[] = [];
  const after: string[] = [];

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) continue;
    if (line.startsWith("-")) before.push(line.slice(1));
    else if (line.startsWith("+")) after.push(line.slice(1));
    else if (line.startsWith("@@")) { before.push("…"); after.push("…"); }
    else { before.push(line.replace(/^ /, "")); after.push(line.replace(/^ /, "")); }
  }
  return { before, after };
}

/**
 * Only a definite statement counts as a pass.
 *
 * The absence of evidence is not evidence of passing. This badge sits directly above the
 * only irreversible button on the page, so "unknown" has to stay available — an earlier
 * version returned true whenever any test output existed at all.
 */
export function testResultFrom(text: string): boolean | null {
  if (!text.trim()) return null;
  if (/\bfail(ed|ing|ures?)?\b|❌|did not pass|\b[1-9]\d* failed\b/i.test(text)) return false;
  if (/\b\d+ (?:tests? )?passed\b|✅|\ball (?:tests? )?pass/i.test(text)) return true;
  return null;
}

/** Recover what the PR body states, since the agent writes it from a fixed template. */
export function readPrBody(body: string) {
  const quoted = [...body.matchAll(/^>\s?(.*)$/gm)].map((m) => m[1] ?? "").join(" ").trim();
  return {
    vendor: /## Upstream change detected — (\S+)/.exec(body)?.[1] ?? "unknown",
    date: /\((\d{4}-\d{2}-\d{2})\)/.exec(body)?.[1] ?? "",
    title: /\*\*Changelog entry\*\*[^:]*:\s*(.+)/.exec(body)?.[1]?.trim() ?? "",
    excerpt: quoted,
    url: /Source:\s*(\S+)/.exec(body)?.[1] ?? "",
    rationale: /\*\*Why this matters:\*\*\s*(.+)/.exec(body)?.[1]?.trim() ?? "",
    files: [...(/\*\*Files changed:\*\*\s*(.+)/.exec(body)?.[1] ?? "").matchAll(/[\w./-]+\.\w+/g)].map((m) => m[0]),
    testOutput: /```\n([\s\S]*?)```/.exec(body)?.[1]?.trim() ?? "",
    // buildPr writes either "Scraped live via Bright Data" or "from cache (DEMO_MODE)".
    // Missing the cached spelling lost the badge on exactly the entries that need it most.
    provenance:
      /Provenance:\s*(\w+)/.exec(body)?.[1] ??
      (/live via Bright Data/.test(body) ? "live" : /from cache|committed capture|\(DEMO_MODE\)/.test(body) ? "cache" : ""),
  };
}

/** The patcher subagent's `{diff, testOutput, passed, rationale}`, from its finished thread. */
function patcherResults(events: ServerEvent[]): Array<{ index: number; title: string; diff: string; passed: boolean | null; rationale: string }> {
  const out = [];
  for (const [index, e] of events.entries()) {
    if (e.type !== "thread.done") continue;
    try {
      const parsed = JSON.parse(e.state?.output?.content ?? "") as { diff?: string; passed?: unknown; rationale?: string };
      if (parsed.diff) {
        out.push({
          index,
          title: e.title ?? "patcher",
          diff: parsed.diff,
          // Only an explicit true is a pass. Absent or malformed means unknown, and the
          // card says so — this badge sits above the merge button.
          passed: parsed.passed === true ? true : parsed.passed === false ? false : null,
          rationale: parsed.rationale ?? "",
        });
      }
    } catch {
      /* not a patcher thread */
    }
  }
  return out;
}

export function toApprovals(events: ServerEvent[]): PendingApproval[] {
  const byId = new Map(events.filter((e) => e.id).map((e) => [e.id!, e]));
  const prCalls = events.flatMap((e, index) =>
    (e.tool_calls ?? []).map(asMcpCall).filter((c): c is McpCall => c?.tool === "create_pull_request").map((call) => ({ index, call })),
  );
  const answered = new Set(
    events.flatMap((e) => (e.type === "user.tool_approval" ? [String((e as unknown as { tool_call_id?: string }).tool_call_id ?? "")] : [])),
  );
  const patches = patcherResults(events);

  const pending: PendingApproval[] = [];

  for (const [eventIndex, event] of events.entries()) {
    if (!isApprovalEvent(event.type)) continue;

    for (const ref of event.tool_calls ?? []) {
      if (!ref.id || answered.has(ref.id)) continue;

      // The pending call carries only a pointer; the arguments live in the source event.
      const source = ref.source_event_id ? byId.get(ref.source_event_id) : undefined;
      const call = source?.tool_calls?.find((c) => c.id === ref.id) ?? source?.tool_calls?.[0];
      const mcp = call ? asMcpCall(call) : null;

      // A generic response_required for an ordinary tool is not a human gate.
      if (event.type === "tool.response_required" && !isGatedCall(mcp)) continue;

      // Correlate to THIS approval, not to whatever happened last in the session. With two
      // changes in one session the reviewer would otherwise read one PR's changelog and diff
      // while approving the merge of a different PR number.
      const prCall = prCalls.filter((p) => p.index < eventIndex).at(-1)?.call;
      const parsed = readPrBody(String(prCall?.input.body ?? ""));
      const patch = patches.filter((p) => p.index < eventIndex).at(-1);

      // The gated call is usually merge_pull_request, and its own input names the PR. That
      // matters when the merge is requested in a session that did not open the PR — the
      // common case for a watch someone comes back to days later. Without this the card
      // would show no PR link at all, which is the one thing a reviewer needs.
      const gated = mcp?.input ?? {};
      const number = Number(gated.pullNumber ?? gated.pull_number ?? 0);
      const owner = String(gated.owner ?? prCall?.input.owner ?? "");
      const repo = String(gated.repo ?? prCall?.input.repo ?? "");
      const prUrl = owner && repo
        ? number
          ? `https://github.com/${owner}/${repo}/pull/${number}`
          : `https://github.com/${owner}/${repo}/pulls`
        : "";

      pending.push({
        id: `${event.thread_id ?? "main"}::${ref.id}`,
        action: mcp ? `${mcp.server}: ${mcp.tool}` : "pending action",
        entry: {
          vendor: parsed.vendor,
          date: parsed.date,
          title: parsed.title || String(prCall?.input.title ?? "Pending action"),
          body: parsed.excerpt,
          url: parsed.url,
          breaking: true,
          symbols: [],
        },
        rationale: parsed.rationale || patch?.rationale || "",
        files: parsed.files,
        diff: patch?.diff ?? "",
        testsPassed: patch ? patch.passed : testResultFrom(parsed.testOutput),
        testOutput: parsed.testOutput,
        provenance: parsed.provenance,
        prUrl,
        prNumber: number,
        prTitle: String(prCall?.input.title ?? ""),
        prBranch: String(prCall?.input.head ?? ""),
      });
    }
  }
  return pending;
}

/* ───────────────────────────────── did ──────────────────────────────────── */

export function toDone(events: ServerEvent[]): DoneItem[] {
  // Which PR numbers were actually merged — not "was anything merged".
  const mergedNumbers = new Set(
    events.flatMap((e) => (e.tool_calls ?? []).map(asMcpCall))
      .filter((c): c is McpCall => c?.tool === "merge_pull_request")
      .map((c) => Number(c.input.pullNumber ?? c.input.pull_number ?? 0))
      .filter(Boolean),
  );

  // The create_pull_request RESPONSE carries the real URL, e.g.
  // {"id":"...","url":"https://github.com/owner/repo/pull/7"} — the only place the number
  // exists. Without it every row linked to the repository root.
  const createdUrls: string[] = [];
  for (const e of events) {
    if (typeof e.content !== "string") continue;
    for (const m of e.content.matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/g)) {
      if (!createdUrls.includes(m[0])) createdUrls.push(m[0]);
    }
  }

  const calls = events
    .flatMap((e) => (e.tool_calls ?? []).map((c) => ({ call: asMcpCall(c), at: e.created_at ?? "" })))
    .filter((x): x is { call: McpCall; at: string } => x.call?.tool === "create_pull_request");

  return calls.map(({ call, at }, i) => {
    const url = createdUrls[i] ?? "";
    const number = Number(/\/pull\/(\d+)/.exec(url)?.[1] ?? 0);

    return {
      id: `pr${i}`,
      vendor: readPrBody(String(call.input.body ?? "")).vendor,
      title: String(call.input.title ?? ""),
      prUrl: url || `https://github.com/${call.input.owner}/${call.input.repo}/pulls`,
      prNumber: number,
      branch: String(call.input.head ?? ""),
      status: number && mergedNumbers.has(number) ? "merged" : "open",
      at,
    };
  });
}

/** Which vendors were read, and whether live — the "is any of this real" question. */
export function toVendors(events: ServerEvent[]): SessionState["vendors"] {
  const found = new Map<string, { provenance: string; entries: number }>();

  for (const e of events) {
    const c = typeof e.content === "string" ? e.content : e.state?.output?.content ?? "";
    if (typeof c !== "string") continue;

    for (const m of c.matchAll(/"vendor"\s*:\s*"(\w+)"[\s\S]{0,200}?"provenance"\s*:\s*"(\w+)"/g)) {
      found.set(m[1] ?? "", { provenance: m[2] ?? "", entries: 0 });
    }
    for (const m of c.matchAll(/(\w+)\s+—\s+(\d+)\/(\d+) entries valid \((\w+)\)/g)) {
      found.set(m[1] ?? "", { provenance: m[4] ?? "", entries: Number(m[2] ?? 0) });
    }
  }
  return [...found.entries()].map(([vendor, v]) => ({ vendor, ...v }));
}

/* ──────────────────────────────── loading ───────────────────────────────── */

export interface SessionRef {
  id: string;
  title: string | null;
  createdAt: string;
}

export async function listSessions(signal?: AbortSignal): Promise<SessionRef[]> {
  const raw = unwrapList<{ id?: string; title?: string | null; created_at?: string }>(
    await getJson(`${API}/sessions`, signal),
  );

  return raw
    .map((s) => ({ id: s.id ?? "", title: s.title ?? null, createdAt: s.created_at ?? "" }))
    .filter((s) => s.id)
    // Newest first is how the server returns them, but sort rather than trust position.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadSession(sessionId?: string, signal?: AbortSignal): Promise<SessionState> {
  const sessions = await listSessions(signal);
  const id = sessionId ?? sessions[0]?.id;

  if (!id) {
    const local = await getJson<Partial<SessionState>>(LOCAL_FEED, signal);
    return local ? { ...EMPTY, ...local } : EMPTY;
  }

  const raw = await getJson<unknown>(`${API}/sessions/${id}/events`, signal);
  if (raw === null) {
    return { ...EMPTY, connected: false, source: "trueforge", error: "session found, but its events could not be read — approvals may be hidden" };
  }

  const events = unwrapEvents(raw);
  const steps = toSteps(events);
  const pending = toApprovals(events);
  const done = toDone(events);

  return {
    connected: true,
    source: "trueforge",
    sessionId: id,
    sessionTitle: sessions.find((s) => s.id === id)?.title ?? null,
    sessions,
    vendors: toVendors(events),
    steps,
    pending,
    done,
    summary: {
      lastCheck: steps.at(-1)?.at ?? null,
      eventsSeen: events.length,
      prsOpened: done.length,
      prsMerged: done.filter((d) => d.status === "merged").length,
      pendingApprovals: pending.length,
    },
  };
}

/**
 * Approve or deny a pending tool call.
 *
 * The gate lives in the harness: this posts a decision and the agent resumes or does not.
 */
export async function decide(
  sessionId: string,
  approvalId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [threadId, toolCallId] = approvalId.split("::");
  if (!threadId || !toolCallId) return { ok: false, error: "malformed approval id" };

  try {
    const res = await fetch(`${API}/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stream: false,
        input: [{
          type: "user.tool_approval",
          thread_id: threadId,
          tool_call_id: toolCallId,
          approval: decision === "approve" ? { status: "allow" } : { status: "deny", reason },
        }],
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `${res.status} ${res.statusText}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export function subscribe(
  sessionId: string | undefined,
  onState: (state: SessionState) => void,
  intervalMs = 2000,
): () => void {
  const controller = new AbortController();
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    onState(await loadSession(sessionId, controller.signal));
    if (!stopped) setTimeout(tick, intervalMs);
  };
  void tick();

  return () => { stopped = true; controller.abort(); };
}
