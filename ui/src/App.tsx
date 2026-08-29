import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentPhase, mergedDetail, type Adapter, type Phase, type RunResult, type UiEvent } from "./adapter.ts";
import { mockAdapter } from "./adapter.mock.ts";
import { realAdapter } from "./adapter.real.ts";
import { HEADLINES, fill } from "./copy.ts";
import { StatusHeader } from "./components/StatusHeader.tsx";
import { Headline } from "./components/Headline.tsx";
import { TimeMachine } from "./components/TimeMachine.tsx";
import { ProofColumn } from "./components/ProofColumn.tsx";
import { NeedsYou } from "./components/NeedsYou.tsx";
import { Receipts } from "./components/Receipts.tsx";
import { useSound } from "./lib/useSound.ts";

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo") === "1";
const adapter: Adapter = DEMO ? mockAdapter : realAdapter;

export function App() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [before, setBefore] = useState<RunResult | undefined>();
  const [after, setAfter] = useState<RunResult | undefined>();
  const [emulatedDate, setEmulatedDate] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const play = useSound(sound);
  const lastPhase = useRef<Phase>("idle");

  // Restore first, then subscribe: a refresh must show the same screen.
  useEffect(() => {
    void (async () => {
      const [past, last] = await Promise.all([adapter.history(), adapter.loadLastRun()]);
      setEvents(past);
      setBefore(last.before);
      setAfter(last.after);
      setEmulatedDate(last.emulatedDate);
    })();

    return adapter.subscribe((e) => setEvents((prev) => [...prev, e]));
  }, []);

  const phase = currentPhase(events);
  const detail = useMemo(() => mergedDetail(events), [events]);

  // One chord when the problem appears, one when it is gone.
  useEffect(() => {
    if (phase !== lastPhase.current) {
      if (phase === "change_found") play("tense");
      if (phase === "merged") play("resolved");
      lastPhase.current = phase;
    }
  }, [phase, play]);

  const shutdown = detail.shutdownDate;

  const runBoth = useCallback(async () => {
    setRunning(true);
    setError(null);

    const consume = async (side: "before" | "after") => {
      const stream = await adapter.run(side);
      for await (const chunk of stream) {
        if (chunk.phase === "tests") {
          const last = await adapter.loadLastRun();
          (side === "before" ? setBefore : setAfter)(side === "before" ? last.before : last.after);
        }
      }
    };

    try {
      await Promise.all([consume("before"), consume("after")]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // Without this a single failed fetch leaves the button disabled and reading
      // "Running…" for the rest of the session, with nothing said about why.
      setRunning(false);
    }
  }, []);

  const changeDate = useCallback(async (date: string) => {
    setEmulatedDate(date);
    // Results belong to the date they were produced for. Showing an outage beside a
    // pre-shutdown slider — or a green column past it — is worse than showing nothing.
    setBefore(undefined);
    setAfter(undefined);

    await adapter.setEmulatedDate(date);
    const last = await adapter.loadLastRun();
    setBefore(last.before);
    setAfter(last.after);
  }, []);

  const decide = useCallback(async (kind: "approve" | "reject", reason?: string) => {
    if (!detail.approvalId) return;
    setBusy(true);
    setError(null);

    try {
      if (kind === "approve") await adapter.approve(detail.approvalId);
      else await adapter.reject(detail.approvalId, reason ?? "");
    } catch (e) {
      // A decision that silently does nothing is the worst outcome here: the person
      // believes they approved a merge that never happened.
      setError(`That did not go through — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [detail.approvalId]);

  const vendorName = detail.vendor ?? "A service";

  return (
    <div data-phase={phase} className="mx-auto min-h-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      {error && (
        <p className="mb-4 rounded-lg border border-bad bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-bad" role="alert">
          {error}
        </p>
      )}

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Upstream Watch</h2>
          <p className="text-[13px] text-dim">{events.at(-1)?.message ?? "Starting up…"}</p>
        </div>
        <StatusHeader phase={phase} shutdownDate={shutdown} />
      </header>

      <div className="grid gap-5">
        <Headline
          outage={fill(HEADLINES.outage, { vendor: vendorName, date: shutdown })}
          fixed={fill(HEADLINES.fixed, { vendor: vendorName, date: shutdown ?? "that day" })}
          merged={phase === "merged" || phase === "repaired"}
          dateline={shutdown}
        />

        {shutdown && (
          <TimeMachine
            shutdownDate={shutdown}
            value={emulatedDate || shutdown}
            onChange={changeDate}
            onRun={runBoth}
            running={running}
          />
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <ProofColumn label="before" result={before} running={running} />
          <ProofColumn label="after" result={after} running={running} />
        </div>

        {phase === "awaiting_approval" && detail.approvalId && (
          <NeedsYou
            detail={detail}
            busy={busy}
            onApprove={() => void decide("approve")}
            onReject={(reason) => void decide("reject", reason)}
          />
        )}

        <Receipts detail={detail} />
      </div>

      <footer className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[12.5px] text-dim">
        <span>{DEMO ? "rehearsal mode — scripted timeline, real captured data" : "live"}</span>
        {DEMO && (
          <>
            <button className="rounded-lg border border-line px-3 py-1.5" onClick={() => mockAdapter.advance()}>
              Next state →
            </button>
            <button className="rounded-lg border border-line px-3 py-1.5" onClick={() => mockAdapter.reset()}>
              Reset
            </button>
          </>
        )}
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          sound
        </label>
      </footer>
    </div>
  );
}
