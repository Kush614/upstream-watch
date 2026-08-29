/**
 * `pnpm demo:snapshot` — freeze a real TrueForge session into ui/public/session.json.
 *
 * The UI prefers the live harness and falls back to that file. Capturing a genuine session
 * through the adapter's OWN mappers means the offline demo renders exactly what the live
 * one does — same steps, same approval card, same provenance — rather than a hand-made
 * approximation that drifts.
 *
 * This is the "everything is down" path from docs/PLAN.md §Fallbacks: no TrueForge, no
 * Bright Data, no network. The header still says "local feed", so nothing claims to be live.
 *
 *   pnpm demo:snapshot                 # newest session with a pending approval, else newest
 *   pnpm demo:snapshot --session <id>  # a specific one
 *   pnpm demo:snapshot --merge <id>    # fold another session's PRs into the Did panel
 */

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toApprovals, toDone, toSteps, toVendors, unwrapEvents } from "../ui/src/adapter.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.TRUEFORGE_URL ?? "http://[::1]:8790").replace("localhost", "[::1]");

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function eventsFor(id: string) {
  return unwrapEvents(await api(`/sessions/${id}/events`));
}

async function main(): Promise<void> {
  const { data: sessions } = await api<{ data: Array<{ id: string; title: string | null; created_at: string }> }>("/sessions");
  const ordered = [...sessions].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Prefer a session that actually stopped at the gate: the approval card is the thing the
  // offline demo most needs to show.
  let chosen = flag("session");
  if (!chosen) {
    for (const s of ordered.slice(0, 12)) {
      if ((await eventsFor(s.id)).some((e) => e.type === "tool.approval_required" || e.type === "tool.response_required")) {
        chosen = s.id;
        break;
      }
    }
  }
  chosen ??= ordered[0]?.id;
  if (!chosen) throw new Error("no sessions to snapshot");

  const events = await eventsFor(chosen);
  const extra = flag("merge") ? await eventsFor(flag("merge")!) : [];

  // The gate session is often short — it exists to stop at the approval. Fold a fuller run
  // in so Doing shows the whole loop: skill, subagents, sandbox, PR, then the pause.
  const steps = [...toSteps(extra), ...toSteps(events)].sort((a, b) => a.at.localeCompare(b.at));
  // Resolve the approval against BOTH sessions. The gate stopped in one session while the
  // PR and the patch were produced in another — the same logical watch, split because the
  // merge was requested later. Live, the card recovers the PR identity from the merge call
  // and shows less; for a frozen demo the fuller evidence is legitimately available.
  const pending = toApprovals([...extra, ...events]);
  const done = [...toDone(extra), ...toDone(events)];
  const vendors = toVendors([...extra, ...events]);

  // A PR body does not always carry the provenance line, but the vendor status does. Fill
  // it in rather than showing a card with no answer to "was this real" — and only from what
  // the run itself reported.
  for (const item of pending) {
    if (!item.provenance) {
      item.provenance = vendors.find((v) => v.vendor === item.entry.vendor)?.provenance ?? "";
    }
  }

  const feed = {
    source: "local",
    connected: false,
    capturedAt: new Date().toISOString(),
    capturedFrom: chosen,
    sessionTitle: ordered.find((s) => s.id === chosen)?.title ?? null,
    vendors,
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

  await writeFile(`${ROOT}/ui/public/session.json`, `${JSON.stringify(feed, null, 2)}\n`, "utf8");

  console.log(
    [
      ``,
      `snapshot -> ui/public/session.json`,
      `  from session   ${chosen}`,
      `  steps          ${steps.length}`,
      `  pending        ${pending.length}${pending.length ? ` (${pending[0]?.action})` : ""}`,
      `  PRs            ${done.length}`,
      `  vendors        ${vendors.map((v) => `${v.vendor}:${v.provenance}`).join(", ") || "none"}`,
      ``,
      `The UI renders this with the harness stopped. Header still reads "local feed".`,
      ``,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`demo:snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
