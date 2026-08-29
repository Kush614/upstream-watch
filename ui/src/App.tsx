import { useCallback, useEffect, useState } from "react";
import { decide, loadSession, subscribe } from "./adapter.ts";
import { Doing } from "./panels/Doing.tsx";
import { WaitingOn } from "./panels/WaitingOn.tsx";
import { Did } from "./panels/Did.tsx";
import type { SessionState } from "./types.ts";

/**
 * specs/ui.md §Stranger test: a judge who has never seen this should be able to press
 * "Check upstream", read three panels, and press Approve. No config on screen, one primary
 * button per state.
 */
export function App() {
  const [state, setState] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State lives in the harness, not in this component — which is why a refresh mid-run
  // shows the same pending approval (specs/ui.md §Waiting on, reconnect test).
  useEffect(() => subscribe(setState), []);

  const onDecide = useCallback(
    async (id: string, decision: "approve" | "reject", reason?: string) => {
      setBusy(id);
      setError(null);

      const result = await decide(id, decision, reason);
      if (!result.ok) setError(result.error ?? "decision failed");

      setState(await loadSession());
      setBusy(null);
    },
    [],
  );

  if (!state) return <main className="loading">Connecting…</main>;

  const { summary } = state;

  return (
    <div className="app">
      <header className="top">
        <h1>Upstream Watch</h1>
        <p className="tagline">
          Watches the APIs your code depends on, patches your code when they change, and asks
          before it merges.
        </p>
        <div className="meta">
          <span className={`conn ${state.connected ? "conn--live" : "conn--local"}`}>
            {state.connected ? "harness connected" : "local feed"}
          </span>
          {summary.lastCheck && <span>last check {summary.lastCheck.slice(0, 16).replace("T", " ")}</span>}
          <span>{summary.eventsSeen} events</span>
          <span>{summary.prsOpened} PRs</span>
          <span>{summary.prsMerged} merged</span>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

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
          <WaitingOn pending={state.pending} onDecide={onDecide} busy={busy} />
        </section>

        <section className="panel">
          <h2>Did</h2>
          <Did done={state.done} />
        </section>
      </main>
    </div>
  );
}
