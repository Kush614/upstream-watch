import { daysUntil } from "../adapter.ts";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Drag from today to a week past the shutdown.
 *
 * The label under it is not decoration: past the shutdown date the vendor's behaviour is
 * emulated, and saying so on screen is the difference between a demo and a claim.
 */
export function TimeMachine({ shutdownDate, value, onChange, onRun, running }: {
  shutdownDate: string;
  value: string;
  onChange: (date: string) => void;
  onRun: () => void;
  running: boolean;
}) {
  const start = today();
  const end = addDays(shutdownDate, 7);
  const total = Math.max(1, daysUntil(end, new Date(`${start}T00:00:00Z`)));
  const at = daysUntil(value, new Date(`${start}T00:00:00Z`));
  const past = value >= shutdownDate;
  const shutdownPct = (daysUntil(shutdownDate, new Date(`${start}T00:00:00Z`)) / total) * 100;

  return (
    <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-dim">Today</span>

        <div className="relative min-w-[220px] flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-[width] ${past ? "bg-bad" : "bg-ok"}`}
              style={{ width: `${(at / total) * 100}%` }}
            />
          </div>
          {/* Where the vendor actually turns it off. */}
          <div
            className="absolute -top-1 h-3.5 w-px bg-bad/70"
            style={{ left: `${shutdownPct}%` }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={0}
            max={total}
            value={at}
            aria-label="Date to test against"
            onChange={(e) => onChange(addDays(start, Number(e.target.value)))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <span className={`font-mono text-[13px] ${past ? "text-bad" : "text-dim"}`}>{shutdownDate}</span>

        <button
          className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
          onClick={onRun}
          disabled={running}
        >
          {running ? "Running…" : "Run both now"}
        </button>
      </div>

      <p className="mt-3 text-[12.5px] text-dim">
        <span className="text-ink">{value}</span>
        {value > start && <> · in {daysUntil(value)} days</>}
        {past && (
          <> — <span className="text-warn">emulating vendor behaviour after {shutdownDate}</span></>
        )}
      </p>
    </section>
  );
}
