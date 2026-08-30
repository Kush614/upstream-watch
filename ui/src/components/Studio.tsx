import { useRef, useState } from "react";

/**
 * Ask the agent, in its own session.
 *
 * The rest of this page is one-way: it reports what already happened. This is the part
 * where a reader who does not believe it, or does not follow it, can push back and get an
 * answer from the thing that did the work — not from a canned string written here.
 *
 * Every reply is a real turn appended to the real session. Two rules follow from that, and
 * they are why this component is careful rather than chatty:
 *
 *  - The harness chains turns on `previous_turn_id`, so a second question sent while one is
 *    still running forks the thread. The composer locks until the answer lands.
 *  - Anything the agent decides to *do* still goes through the approval card. This panel is
 *    not a side door around the merge gate.
 */

/** Starting points, because a blank box in front of an agent is its own kind of unhelpful. */
const PINNED = [
  "Why did you change this? Answer in two sentences.",
  "Which vendors did you read live, and which came from a cached capture?",
  "What exactly did you run to decide the tests pass?",
  "What happens to my service if I do not merge this?",
  "Show me the changelog entry you matched, and the symbol it matched on.",
  "What did you consider changing and decide not to?",
];

interface Exchange {
  question: string;
  answer?: string;
  error?: string;
}

export function Studio({ ask, sessionKnown }: { ask: (q: string) => Promise<string>; sessionKnown: boolean }) {
  const [log, setLog] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;

    setDraft("");
    setBusy(true);
    setLog((l) => [...l, { question: text }]);

    try {
      const answer = await ask(text);
      setLog((l) => l.map((e, i) => (i === l.length - 1 ? { ...e, answer } : e)));
    } catch (e) {
      // Show the failure against the question that caused it. A question that silently
      // never gets answered looks like the agent ignoring you.
      const message = e instanceof Error ? e.message : String(e);
      setLog((l) => l.map((entry, i) => (i === l.length - 1 ? { ...entry, error: message } : entry)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Ask the agent</h2>
        <p className="text-[12.5px] text-dim">
          {sessionKnown ? "answers come from the session that did this work" : "no session — start a watch to ask"}
        </p>
      </div>

      {log.length === 0 && (
        <p className="mb-3 text-[13px] text-dim">
          It can read its own transcript, the changelog it scraped, and the diff it wrote. It cannot merge
          anything from here — that still needs the card above.
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {PINNED.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            disabled={busy || !sessionKnown}
            className="rounded-full border border-line px-3 py-1 text-left text-[12.5px] text-dim hover:text-fg disabled:opacity-40"
          >
            {q.length > 46 ? `${q.slice(0, 44)}…` : q}
          </button>
        ))}
      </div>

      {log.length > 0 && (
        <div className="mb-3 grid max-h-[22rem] gap-3 overflow-y-auto pr-1">
          {log.map((e, i) => (
            <div key={`${e.question}-${i}`} className="grid gap-1.5">
              <p className="text-[13.5px] font-medium">{e.question}</p>
              {e.answer && <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-dim">{e.answer}</p>}
              {e.error && <p className="text-[13px] text-bad">Could not ask — {e.error}</p>}
              {!e.answer && !e.error && <p className="text-[13px] text-dim">thinking…</p>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void send(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          disabled={busy || !sessionKnown}
          placeholder={sessionKnown ? "Ask it something else…" : "Start the harness to ask questions"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-[13.5px] disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim() || !sessionKnown}
          className="rounded-lg border border-line px-3.5 py-2 text-[13.5px] disabled:opacity-40"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
    </section>
  );
}
