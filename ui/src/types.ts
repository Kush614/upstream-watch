/**
 * What the panels render. Mirrors the pipeline's ChangeEvent and the patcher contract in
 * specs/patcher.md, plus the session summary the orchestrator maintains.
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
  /** <= 40 words (specs/agent.md §Approval checkpoint). */
  body: string;
  url: string;
  breaking: boolean;
  symbols: string[];
}

export interface PendingApproval {
  id: string;
  action: string;
  entry: ChangelogExcerpt;
  files: string[];
  diff: string;
  /** null = we do not know. Never assume passing: a human is about to merge on this. */
  testsPassed: boolean | null;
  testOutput: string;
  prUrl: string;
  prNumber: number;
}

export interface DoneItem {
  id: string;
  vendor: string;
  title: string;
  prUrl: string;
  prNumber: number;
  status: "open" | "merged" | "draft" | "rejected";
  at: string;
}

export interface SessionSummary {
  lastCheck: string | null;
  eventsSeen: number;
  prsOpened: number;
  prsMerged: number;
  pendingApprovals: number;
}

export interface SessionState {
  connected: boolean;
  /** Set when the harness answered but part of the read failed. */
  error?: string;
  source: "trueforge" | "local";
  summary: SessionSummary;
  steps: Step[];
  pending: PendingApproval[];
  done: DoneItem[];
}
