import type { SessionState } from "./types.ts";

/**
 * Where the panels get their data.
 *
 * Preferred source is the TrueForge server: it owns sessions, the step stream and pending
 * approvals, which is why a browser refresh does not lose the run. When it is not
 * reachable the panels fall back to a local feed written by `pnpm demo:feed`, so the UI is
 * developable and demoable without the harness running.
 *
 * VERIFY against http://localhost:8790/api/v1/docs — the exact session/approval routes are
 * the one thing here that has not been confirmed against a running server. Everything
 * below is deliberately isolated so that confirming them is a change to this file only.
 */

const TRUEFORGE_SESSION = "/api/v1/sessions/current";
const TRUEFORGE_APPROVALS = "/api/v1/approvals";
const LOCAL_FEED = "/session.json";

const EMPTY: SessionState = {
  connected: false,
  source: "local",
  summary: { lastCheck: null, eventsSeen: 0, prsOpened: 0, prsMerged: 0, pendingApprovals: 0 },
  steps: [],
  pending: [],
  done: [],
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadSession(signal?: AbortSignal): Promise<SessionState> {
  const live = await getJson<Partial<SessionState>>(TRUEFORGE_SESSION, signal);
  if (live) {
    const approvals = (await getJson<SessionState["pending"]>(TRUEFORGE_APPROVALS, signal)) ?? [];
    return { ...EMPTY, ...live, pending: live.pending ?? approvals, connected: true, source: "trueforge" };
  }

  const local = await getJson<Partial<SessionState>>(LOCAL_FEED, signal);
  if (local) return { ...EMPTY, ...local, connected: false, source: "local" };

  return EMPTY;
}

/**
 * Approve or reject a pending action.
 *
 * The gate lives in the harness, not here: this posts a decision and the agent proceeds or
 * does not. Rejecting requires a reason, which is recorded on the PR
 * (specs/agent.md §Failure modes).
 */
export async function decide(
  approvalId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${TRUEFORGE_APPROVALS}/${encodeURIComponent(approvalId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `${res.status} ${res.statusText}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Poll for session changes. SSE is the intended transport; VERIFY the endpoint first. */
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
