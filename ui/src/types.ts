/**
 * What the panels render.
 *
 * Everything here is recovered from the harness's own event stream — see adapter.ts.
 * Nothing is synthesised: if a field cannot be recovered it stays empty or null, so the
 * UI can say "unknown" rather than assert something nothing established.
 */

export type StepKind =
  | "skill" | "scrape" | "diff" | "subagent" | "sandbox" | "tests" | "pr" | "approval" | "merge" | "repair";

export interface Step {
  id: string;
  kind: StepKind;
  label: string;
  at: string;
  status: "running" | "ok" | "warn" | "fail";
  detail?: string;
}

export interface ChangelogExcerpt {
  vendor: string;
  date: string;
  title: string;
  body: string;
  url: string;
  breaking: boolean;
  symbols: string[];
}

export interface PendingApproval {
  id: string;
  /** e.g. "github: merge_pull_request" — the actual gated MCP call. */
  action: string;
  entry: ChangelogExcerpt;
  rationale: string;
  files: string[];
  /** Unified diff from the patcher subagent. */
  diff: string;
  /** null = unknown. Never assume passing: a human is about to merge on this. */
  testsPassed: boolean | null;
  testOutput: string;
  /** "live" or "cache" — whether the changelog behind this was actually fetched. */
  provenance: string;
  prUrl: string;
  prNumber: number;
  prTitle: string;
  prBranch: string;
}

export interface DoneItem {
  id: string;
  vendor: string;
  title: string;
  prUrl: string;
  prNumber: number;
  branch: string;
  status: "open" | "merged" | "draft" | "rejected";
  at: string;
}

export interface VendorStatus {
  vendor: string;
  /** "live" = Bright Data fetched it this run; "cache" = replayed a committed capture. */
  provenance: string;
  entries: number;
}

export interface SessionSummary {
  lastCheck: string | null;
  eventsSeen: number;
  prsOpened: number;
  prsMerged: number;
  pendingApprovals: number;
}

export interface SessionRefLite {
  id: string;
  title: string | null;
  createdAt: string;
}

export interface SessionState {
  connected: boolean;
  source: "trueforge" | "local";
  error?: string;
  sessionId?: string;
  sessionTitle?: string | null;
  sessions?: SessionRefLite[];
  vendors: VendorStatus[];
  summary: SessionSummary;
  steps: Step[];
  pending: PendingApproval[];
  done: DoneItem[];
}
