import type { Step } from "../types.ts";

const ICON: Record<Step["kind"], string> = {
  skill: "◇", scrape: "⇣", diff: "≠", subagent: "⑂", sandbox: "▣",
  tests: "✓", pr: "⇪", approval: "⏸", merge: "⇥", repair: "⚒",
};

/**
 * Doing — what the agent is doing right now (specs/ui.md §Doing).
 *
 * The sandbox step gets its own badge deliberately: watch turns are cheap and provision
 * nothing, and a sandbox appearing only when there is real work to do is the design point
 * worth showing a judge.
 */
export function Doing({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return <p className="empty">Idle. Ask the agent to check upstream.</p>;
  }

  return (
    <ol className="steps">
      {steps.map((step) => (
        <li key={step.id} className={`step step--${step.status}`}>
          <span className="step__icon" aria-hidden="true">{ICON[step.kind]}</span>
          <span className="step__label">
            {step.label}
            {step.kind === "sandbox" && <span className="badge badge--sandbox">Daytona</span>}
          </span>
          {step.detail && <span className="step__detail">{step.detail}</span>}
          <time className="step__time">{step.at.slice(11, 19)}</time>
        </li>
      ))}
    </ol>
  );
}
