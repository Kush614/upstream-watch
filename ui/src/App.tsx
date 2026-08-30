import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentPhase, mergedDetail, type Adapter, type Phase, type RunResult, type UiEvent, type VendorRow, type PackageFinding, type OssProof, type Captures } from "./adapter.ts";
import { mockAdapter } from "./adapter.mock.ts";
import { realAdapter } from "./adapter.real.ts";
import { HEADLINES, fill } from "./copy.ts";
import { StatusHeader } from "./components/StatusHeader.tsx";
import { VendorTimeline } from "./components/VendorTimeline.tsx";
import { PageDiff } from "./components/PageDiff.tsx";
import { countsLine } from "./lib/severity.ts";
import { Headline } from "./components/Headline.tsx";
import { ProofColumn } from "./components/ProofColumn.tsx";
import { NeedsYou } from "./components/NeedsYou.tsx";
import { Receipts } from "./components/Receipts.tsx";
import { Watchlist } from "./components/Watchlist.tsx";
import { Explorer } from "./components/Explorer.tsx";
import { Studio } from "./components/Studio.tsx";
import { useSound } from "./lib/useSound.ts";

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo") === "1";
const adapter: Adapter = DEMO ? mockAdapter : realAdapter;

export function App() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [before, setBefore] = useState<RunResult | undefined>();
  const [after, setAfter] = useState<RunResult | undefined>();
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [packages, setPackages] = useState<PackageFinding[]>([]);
  const [ossProofs, setOssProofs] = useState<OssProof[]>([]);
  const [upstreamProblem, setUpstreamProblem] = useState<string>();
  const [captures, setCaptures] = useState<Captures>();
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
    })();

    // The watchlist is a separate claim with a separate failure mode: if the runner is
    // down, an empty table would read as "nothing is watched", so say why instead.
    const surface = (e: unknown) => setUpstreamProblem(e instanceof Error ? e.message : String(e));
    void adapter.listVendors().then(setVendors).catch(surface);
    void adapter.listPackages().then(setPackages).catch(surface);
    void adapter.listOssProofs().then(setOssProofs).catch(surface);
    // Captures belong to the vendor this run is about. Hardcoding one meant a Cloudflare
    // run showed OpenAI's page under the heading "their page changed".


    return adapter.subscribe((e) => setEvents((prev) => [...prev, e]));
  }, []);

  const phase = currentPhase(events);
  const detail = useMemo(() => mergedDetail(events), [events]);
  const counts = useMemo(() => countsLine(events), [events]);

  // Captures belong to the vendor THIS run is about. Hardcoding one meant a Cloudflare run
  // would show OpenAI's page under the heading "their page changed". A failure is not worth
  // an alert: the absence of a redesign is the normal case.
  useEffect(() => {
    if (!detail.vendor) return;
    void adapter.listCaptures(detail.vendor).then(setCaptures).catch(() => undefined);
  }, [detail.vendor]);

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
        <StatusHeader phase={phase} shutdownDate={shutdown} counts={counts} />
      </header>

      <div className="grid gap-5">
        <Headline
          outage={fill(HEADLINES.outage, { vendor: vendorName, date: shutdown })}
          fixed={fill(HEADLINES.fixed, { vendor: vendorName, date: shutdown ?? "that day" })}
          merged={phase === "merged" || phase === "repaired"}
          dateline={shutdown}
        />

        {/* No slider, and nothing to emulate: gpt-5.1-codex-mini really was shut down on
            2026-07-23, so both columns call the live api.openai.com and report what it says. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
          <p className="text-[13.5px] text-dim">
            Both columns call the real <span className="text-fg">api.openai.com</span> right now — one
            commit each, one request each.
          </p>
          <button
            type="button"
            onClick={runBoth}
            disabled={running}
            className="rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-bg disabled:opacity-50"
          >
            {running ? "Running…" : "Run both"}
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ProofColumn label="before" result={before} running={running} />
          <ProofColumn label="after" result={after} running={running} />
        </div>

        <Explorer vendors={vendors} packages={packages} proofs={ossProofs} problem={upstreamProblem} />

        <Watchlist rows={vendors} onCheck={(v) => adapter.checkVendor(v)} />

        <Studio ask={(q) => adapter.ask(q)} sessionKnown={adapter.hasLiveSession()} />

        {phase === "awaiting_approval" && detail.approvalId && (
          <NeedsYou
            detail={detail}
            busy={busy}
            onApprove={() => void decide("approve")}
            onReject={(reason) => void decide("reject", reason)}
          />
        )}

        {captures?.differ && (
          <section className="grid gap-2 rounded-xl border border-line bg-panel p-4">
            <h2 className="text-[15px] font-semibold">Their page changed</h2>
            <PageDiff captures={captures} runner="/proof" />
          </section>
        )}

        {detail.timeline && (
          <section className="rounded-xl border border-line bg-panel px-4 py-3.5">
            <VendorTimeline timeline={detail.timeline} vendor={detail.vendor} />
          </section>
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
