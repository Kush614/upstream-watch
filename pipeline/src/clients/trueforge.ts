import { TrueForgeError } from "../errors.ts";

/**
 * The TrueForge HTTP API.
 *
 * Every external call goes through a client with typed responses (CLAUDE.md §7) — this one
 * exists because a script was talking to the harness directly, which spreads endpoint and
 * transport knowledge outside the boundary that is supposed to hold it.
 *
 * Routes verified against a running server's own OpenAPI document.
 */

/** TrueForge binds the IPv6 loopback; "localhost" resolves to 127.0.0.1, where nothing is. */
const DEFAULT_BASE = "http://[::1]:8790";

export interface SessionRef {
  id: string;
  title: string | null;
  createdAt: string;
}

export interface TrueForgeClient {
  listSessions(): Promise<SessionRef[]>;
  sessionEvents(sessionId: string): Promise<unknown>;
}

export class TrueForgeHttpClient implements TrueForgeClient {
  readonly #base: string;

  constructor(base = process.env.TRUEFORGE_URL ?? DEFAULT_BASE) {
    this.#base = base.replace("localhost", "[::1]").replace(/\/$/, "");
  }

  async #get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.#base}/api/v1${path}`);
    } catch (cause) {
      throw new TrueForgeError(
        `Could not reach TrueForge at ${this.#base}. Is it running? (npx @truefoundry/trueforge)`,
        { path, cause: String(cause) },
      );
    }

    if (!res.ok) {
      throw new TrueForgeError(`TrueForge ${path} -> ${res.status} ${res.statusText}`, {
        path,
        status: res.status,
      });
    }
    return (await res.json()) as T;
  }

  /** Newest first. The server returns them that way, but sort rather than trust position. */
  async listSessions(): Promise<SessionRef[]> {
    const { data } = await this.#get<{ data: Array<{ id?: string; title?: string | null; created_at?: string }> }>("/sessions");

    return (data ?? [])
      .map((s) => ({ id: s.id ?? "", title: s.title ?? null, createdAt: s.created_at ?? "" }))
      .filter((s) => s.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async sessionEvents(sessionId: string): Promise<unknown> {
    return this.#get(`/sessions/${encodeURIComponent(sessionId)}/events`);
  }
}
