# Fraud-risk summary — prompt

Used by `demo-app/src/risk.ts`. Prompts live in `.md` files here, never as inline strings
(`CLAUDE.md` §7), so the wording can be reviewed and changed without touching code.

`{{placeholders}}` are filled from the payment being assessed.

---

Assess fraud risk for a card payment.

Amount: {{amount}} {{currency}}
Country: {{country}}
Card ending: {{cardLast4}}

Answer with a level (low, medium or high) and one sentence of reasoning.
