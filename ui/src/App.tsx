import { useCallback, useEffect, useState } from "react";
import { decide, loadSession, subscribe } from "./adapter.ts";
import { Doing } from "./panels/Doing.tsx";
import { WaitingOn } from "./panels/WaitingOn.tsx";
import { Did } from "./panels/Did.tsx";
import { Vendors } from "./panels/Vendors.tsx";
import type { SessionState } from "./types.ts";

/**
 * specs/ui.md §Stranger test: a judge who has never seen this should be able to read the
 * three panels and press Approve. No config on screen, one primary button per state.
 */
export function App() {
  const [state, setState] = useState<SessionState | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State lives in the harness, not in this component — which is why a refresh mid-run
  // shows the same pending approval (specs/ui.md, reconnect test).
  useEffect(() => subscribe(sessionId, setState), [sessionId]);

  const onDecide = useCallback(
    async (id: string, decision: "approve" | "reject", reason?: string) => {
      if (!state?.sessionId) return;
      setBusy(id);
      setError(null);

      const result = await decide(state.sessionId, id, decision, reason);
      if (!result.ok) setError(result.error ?? "decision failed");

      setState(await loadSession(state.sessionId));
      setBusy(null);
    },
    [state?.sessionId],
  );

  if (!state) return <main className="loading">Connecting to the harness…</main>;

  const { summary } = state;

  return (
    <div className="app">
      <header className="top">
        <div className="top__row">
          <h1>Upstream Watch</h1>
          <span className={`conn ${state.connected ? "conn--live" : "conn--local"}`}>
            {state.connected ? "harness connected" : "local feed"}
          </span>
        </div>
        <p className="tagline">
          Watches the APIs your code depends on, patches your code when they change, and asks
          before it merges.
        </p>

        <Vendors vendors={state.vendors} />

        <div className="meta">
          {state.sessions && state.sessions.length > 0 && (
            <label className="picker">
              session
              <select value={state.sessionId ?? ""} onChange={(e) => setSessionId(e.target.value)}>
                {state.sessions.slice(0, 12).map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.title ?? s.id).slice(0, 44)} · {s.createdAt.slice(11, 16)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span><strong>{summary.eventsSeen}</strong> events</span>
          <span><strong>{summary.prsOpened}</strong> PRs opened</span>
          <span><strong>{summary.prsMerged}</strong> merged</span>
          <span><strong>{summary.pendingApprovals}</strong> awaiting you</span>
        </div>
      </header>

      {(error || state.error) && <p className="error">{error ?? state.error}</p>}

      <main className="panels">
        <section className="panel">
          <h2>Doing</h2>
          <Doing steps={state.steps} />
        </section>

        <section className="panel panel--focus">
          <h2>
            Waiting on you
            {state.pending.length > 0 && <span className="count">{state.pending.length}</span>}
          </h2>
          <WaitingOn pending={state.pending} onDecide={onDecide} busy={busy} connected={state.connected} />
        </section>

        <section className="panel">
          <h2>Did</h2>
          <Did done={state.done} />
        </section>
      </main>
    </div>
  );
}
