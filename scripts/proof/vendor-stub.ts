/**
 * The emulated vendor — the one thing on the screen that is not real, and the UI says so.
 *
 * Before the shutdown date it accepts everything. On or after it, a request naming the
 * retired model gets the error OpenAI actually returns.
 *
 * It also RECORDS every request it receives, which is what makes the proof honest: the
 * request shown in the UI is the one the checked-out commit actually sent during its test
 * run, not one this process composed to look plausible.
 */

import { createServer, type Server } from "node:http";

export interface VendorConfig {
  port: number;
  shutdownDate: string;
  retiredModel: string;
  /** Read at request time so the slider takes effect without a restart. */
  emulatedDate: () => string;
}

export interface RecordedCall {
  request: unknown;
  status: number;
  excerpt: string;
  at: string;
}

export class VendorStub {
  #server?: Server;
  #calls: RecordedCall[] = [];

  constructor(private readonly config: VendorConfig) {}

  /** Every request seen since the last `reset()`, oldest first. */
  get calls(): RecordedCall[] {
    return this.#calls;
  }

  reset(): void {
    this.#calls = [];
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.#server = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          let parsed: unknown = {};
          try {
            parsed = JSON.parse(body || "{}");
          } catch {
            /* a malformed body is the caller's problem; still record it */
          }

          const model = (parsed as { model?: string }).model ?? "";
          const retired = model === this.config.retiredModel && this.config.emulatedDate() >= this.config.shutdownDate;

          const payload = retired
            ? {
                error: {
                  message: `The model \`${this.config.retiredModel}\` has been shut down. Learn more: https://platform.openai.com/docs/deprecations`,
                  type: "invalid_request_error",
                  code: "model_not_found",
                },
              }
            : { id: "resp_proof", output_text: "low — small amount, familiar country" };

          const status = retired ? 400 : 200;
          const text = JSON.stringify(payload);

          this.#calls.push({
            request: parsed,
            status,
            excerpt: retired ? (payload as { error: { message: string } }).error.message : text,
            at: new Date().toISOString(),
          });

          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(text);
        });
      });
      this.#server.listen(this.config.port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.#server?.close(() => resolve()) ?? resolve());
  }
}
