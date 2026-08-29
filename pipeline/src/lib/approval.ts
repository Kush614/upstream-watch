import { ApprovalRequiredError } from "../errors.ts";

/**
 * The approval gate (CLAUDE.md §2.3, §7).
 *
 * "Functions that take an irreversible action must accept `{ approved: true }`
 * explicitly; default is dry-run."
 *
 * The default matters more than the check. A gate you have to remember to call is not a
 * gate - so the safe path is what you get when you pass nothing at all, and an action only
 * runs when a caller has said `approved: true` in so many words.
 */

export interface ApprovalOptions {
  /** Must be exactly true. Anything else - including undefined - is a dry run. */
  approved?: boolean;
  /** Recorded when an action is declined, so the UI and NOTES.md can show why. */
  reason?: string;
}

export interface DryRun {
  performed: false;
  action: string;
  description: string;
}

export interface Performed<T> {
  performed: true;
  action: string;
  result: T;
}

export type GatedResult<T> = DryRun | Performed<T>;

/**
 * Run `perform` only with explicit approval; otherwise describe what would have happened.
 *
 * Returns a dry run rather than throwing: the normal case is "the agent proposed
 * something and is waiting", which is not an error. Use `requireApproval` for the
 * lower-level guard that does throw.
 */
export async function withApproval<T>(
  action: string,
  description: string,
  options: ApprovalOptions,
  perform: () => Promise<T>,
): Promise<GatedResult<T>> {
  if (options.approved !== true) {
    return { performed: false, action, description };
  }
  return { performed: true, action, result: await perform() };
}

/** Hard guard for call sites where proceeding unapproved is a bug, not a dry run. */
export function requireApproval(action: string, options: ApprovalOptions): void {
  if (options.approved !== true) {
    throw new ApprovalRequiredError(`"${action}" requires explicit { approved: true }`, {
      action,
      reason: options.reason,
    });
  }
}

/** Actions that always need a human (specs/agent.md §Approvals). */
export const GATED_ACTIONS = [
  "merge-pr",
  "close-pr",
  "push-to-main",
  "write-live-store",
] as const;

export type GatedAction = (typeof GATED_ACTIONS)[number];
